import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SupervisorDb } from "../src/db.js";
import { SQLiteSessionStorage } from "../src/session-storage.js";

let db: SupervisorDb;
let tmpDir: string;
let sessionA: number;
let sessionB: number;

function insertSession(db: SupervisorDb, overrides: Partial<Parameters<SupervisorDb["insert"]>[0]> = {}) {
	return db.insert({
		project_id: null,
		parent_id: null,
		session_id: null,
		pid: null,
		status: "idle",
		cwd: "/proj",
		meta: "{}",
		...overrides,
	});
}

beforeEach(() => {
	tmpDir = join(tmpdir(), `supervisor-storage-test-${Date.now()}`);
	mkdirSync(tmpDir, { recursive: true });
	db = new SupervisorDb(join(tmpDir, "test.db"));
	sessionA = insertSession(db).id;
	sessionB = insertSession(db).id;
});

afterEach(() => {
	db.close();
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("supervisor: SQLiteSessionStorage", () => {
	it("isolates entries per session_id", async () => {
		const storageA = new SQLiteSessionStorage(db, sessionA);
		const storageB = new SQLiteSessionStorage(db, sessionB);

		const idA = await storageA.createEntryId();
		await storageA.appendEntry({
			id: idA,
			parentId: null,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "user", content: "from A", timestamp: Date.now() },
		});

		const idB = await storageB.createEntryId();
		await storageB.appendEntry({
			id: idB,
			parentId: null,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "user", content: "from B", timestamp: Date.now() },
		});

		const entriesA = await storageA.getEntries();
		const entriesB = await storageB.getEntries();
		expect(entriesA).toHaveLength(1);
		expect(entriesB).toHaveLength(1);
		expect(entriesA[0]?.id).toBe(idA);
		expect(entriesB[0]?.id).toBe(idB);
	});

	it("setLeafId persists on sessions row", async () => {
		const storage = new SQLiteSessionStorage(db, sessionA);
		const entryId = await storage.createEntryId();
		await storage.setLeafId(entryId);
		expect(db.get(sessionA)!.leaf_id).toBe(entryId);
	});

	it("getMetadata() includes sessions.meta from the database", async () => {
		const metaSession = insertSession(db, {
			meta: JSON.stringify({ stage: "implement", change: "feat-1" }),
		});

		const storage = new SQLiteSessionStorage(db, metaSession.id);
		const metadata = await storage.getMetadata();
		const harnessMetadata = await storage.getHarnessMetadata();

		expect((metadata as { meta?: Record<string, unknown> }).meta).toEqual({
			stage: "implement",
			change: "feat-1",
		});
		expect(harnessMetadata.meta).toEqual({ stage: "implement", change: "feat-1" });
		expect(harnessMetadata.id).toBe(metaSession.id);
	});

	it("stores is_old separately from payload and meta", async () => {
		const storage = new SQLiteSessionStorage(db, sessionA);
		const entryId = await storage.createEntryId();
		await storage.appendEntry(
			{
				id: entryId,
				parentId: null,
				timestamp: new Date().toISOString(),
				type: "message",
				message: { role: "user", content: "forked", timestamp: Date.now() },
			},
			{ isOld: true },
		);

		const stored = await storage.getStoredMessages();
		expect(stored).toHaveLength(1);
		expect(stored[0]?.isOld).toBe(true);
		expect(stored[0]?.meta).toEqual({});
		expect(stored[0]?.entry.id).toBe(entryId);
	});

	it("stores queued source on the next user message only", async () => {
		const storage = new SQLiteSessionStorage(db, sessionA);
		storage.queueUserMessageSource("sidecar-reviewer");

		const assistantId = await storage.createEntryId();
		await storage.appendEntry({
			id: assistantId,
			parentId: null,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "assistant", content: "not sourced", timestamp: Date.now() },
		});

		const userId = await storage.createEntryId();
		await storage.appendEntry({
			id: userId,
			parentId: assistantId,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "user", content: "from sidecar", timestamp: Date.now() },
		});

		const nextUserId = await storage.createEntryId();
		await storage.appendEntry({
			id: nextUserId,
			parentId: userId,
			timestamp: new Date().toISOString(),
			type: "message",
			message: { role: "user", content: "from user", timestamp: Date.now() },
		});

		const stored = await storage.getStoredMessages();
		expect(stored.map((item) => item.source)).toEqual([null, "sidecar-reviewer", null]);
		expect(stored.map((item) => item.entry.id)).toEqual([assistantId, userId, nextUserId]);
	});

	it("exposes source in session message responses", async () => {
		const storage = new SQLiteSessionStorage(db, sessionA);
		const entryId = await storage.createEntryId();
		await storage.appendEntry(
			{
				id: entryId,
				parentId: null,
				timestamp: new Date().toISOString(),
				type: "message",
				message: { role: "user", content: "from sidecar", timestamp: Date.now() },
			},
			{ source: "sidecar-a" },
		);

		const stored = await storage.getStoredMessages();
		expect(stored[0]?.source).toBe("sidecar-a");
	});
});
