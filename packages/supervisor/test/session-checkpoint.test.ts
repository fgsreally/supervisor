import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SupervisorDb } from "../src/db.js";
import { appendReadOrchestrationHint } from "../src/extension-system/extensions/read/read-orchestration.js";
import {
	createSessionCheckpoint,
	listSessionCheckpoints,
	parseCheckpoints,
	rewindSessionToCheckpoint,
} from "../src/session-checkpoint.js";
import { SQLiteSessionStorage } from "../src/session-storage.js";

let db: SupervisorDb;
let tmpDir: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `supervisor-cp-test-${Date.now()}`);
	mkdirSync(tmpDir, { recursive: true });
	db = new SupervisorDb(join(tmpDir, "test.db"));
});

afterEach(() => {
	db.close();
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("supervisor: session-checkpoint", () => {
	it("parseCheckpoints reads meta array", () => {
		const items = parseCheckpoints({
			checkpoints: [
				{ id: "cp-1", entryId: "e-1", gitRef: "abc", createdAt: 100 },
				{ id: "cp-2", entryId: "e-2", gitRef: null, label: "before refactor", createdAt: 200 },
			],
		});
		expect(items).toHaveLength(2);
		expect(items[0]?.id).toBe("cp-1");
		expect(items[1]?.label).toBe("before refactor");
	});

	it("createCheckpoint stores entryId and label in meta", async () => {
		const session = db.insert({
			project_id: null,
			parent_id: null,
			session_id: null,
			pid: null,
			status: "idle",
			cwd: tmpDir,
			meta: JSON.stringify({}),
		});

		const storage = new SQLiteSessionStorage(db, session.id);
		const entryId = await storage.createEntryId();
		await storage.appendEntry({
			id: entryId,
			parentId: null,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "user", content: "hello", timestamp: Date.now() },
		});

		const checkpoint = await createSessionCheckpoint(db, session.id, { label: "turn-1" });
		expect(checkpoint.entryId).toBe(entryId);
		expect(checkpoint.label).toBe("turn-1");

		const listed = listSessionCheckpoints(db, session.id);
		expect(listed).toHaveLength(1);
		expect(listed[0]?.id).toBe(checkpoint.id);
	});

	it("alternating checkpoints rewind to correct leaves", async () => {
		const session = db.insert({
			project_id: null,
			parent_id: null,
			session_id: null,
			pid: null,
			status: "idle",
			cwd: tmpDir,
			meta: JSON.stringify({}),
		});

		const storage = new SQLiteSessionStorage(db, session.id);
		const entry1 = await storage.createEntryId();
		await storage.appendEntry({
			id: entry1,
			parentId: null,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "user", content: "first", timestamp: Date.now() },
		});
		const cp1 = await createSessionCheckpoint(db, session.id, { label: "at-first" });

		const entry2 = await storage.createEntryId();
		await storage.appendEntry({
			id: entry2,
			parentId: entry1,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "user", content: "second", timestamp: Date.now() },
		});
		const cp2 = await createSessionCheckpoint(db, session.id, { label: "at-second" });

		await rewindSessionToCheckpoint(db, session.id, cp1.id);
		expect(db.get(session.id)?.leaf_id).toBe(entry1);

		await rewindSessionToCheckpoint(db, session.id, cp2.id);
		expect(db.get(session.id)?.leaf_id).toBe(entry2);
	});

	it("rewind then append continues from restored leaf without breaking tree", async () => {
		const session = db.insert({
			project_id: null,
			parent_id: null,
			session_id: null,
			pid: null,
			status: "idle",
			cwd: tmpDir,
			meta: JSON.stringify({}),
		});

		const storage = new SQLiteSessionStorage(db, session.id);
		const entry1 = await storage.createEntryId();
		await storage.appendEntry({
			id: entry1,
			parentId: null,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "user", content: "first", timestamp: Date.now() },
		});
		const checkpoint = await createSessionCheckpoint(db, session.id);

		const entry2 = await storage.createEntryId();
		await storage.appendEntry({
			id: entry2,
			parentId: entry1,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "user", content: "abandoned", timestamp: Date.now() },
		});

		await rewindSessionToCheckpoint(db, session.id, checkpoint.id);
		expect(db.get(session.id)?.leaf_id).toBe(entry1);

		const entry3 = await storage.createEntryId();
		await storage.appendEntry({
			id: entry3,
			parentId: entry1,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "user", content: "continued", timestamp: Date.now() },
		});
		expect(db.get(session.id)?.leaf_id).toBe(entry3);

		const path = await storage.getPathToRoot(entry3);
		expect(path.map((row) => row.id)).toEqual([entry1, entry3]);
	});

	it("rewindToCheckpoint restores leaf and appends audit entry", async () => {
		const session = db.insert({
			project_id: null,
			parent_id: null,
			session_id: null,
			pid: null,
			status: "idle",
			cwd: tmpDir,
			meta: JSON.stringify({}),
		});

		const storage = new SQLiteSessionStorage(db, session.id);
		const entry1 = await storage.createEntryId();
		await storage.appendEntry({
			id: entry1,
			parentId: null,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "user", content: "first", timestamp: Date.now() },
		});

		const checkpoint = await createSessionCheckpoint(db, session.id, { label: "at-first" });

		const entry2 = await storage.createEntryId();
		await storage.appendEntry({
			id: entry2,
			parentId: entry1,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "user", content: "second", timestamp: Date.now() },
		});
		expect(db.get(session.id)?.leaf_id).toBe(entry2);

		await rewindSessionToCheckpoint(db, session.id, checkpoint.id);
		expect(db.get(session.id)?.leaf_id).toBe(entry1);

		const messages = await storage.getStoredMessages();
		const audit = messages.find((row) => row.entry.type === "custom" && row.entry.customType === "checkpoint-rewind");
		expect(audit).toBeDefined();
	});
});

describe("supervisor: read-orchestration", () => {
	it("appendReadOrchestrationHint adds guidance once", () => {
		const once = appendReadOrchestrationHint("base prompt");
		expect(once).toContain("Reading strategy (two-phase)");
		const twice = appendReadOrchestrationHint(once);
		expect(twice).toBe(once);
	});
});
