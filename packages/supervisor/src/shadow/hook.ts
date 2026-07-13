import type { AgentHarnessEvent } from "@earendil-works/pi-agent-core";
import { findPackagedAgentId } from "../agent/internal-agents.js";
import type { SessionManager } from "../core/session-manager.js";
import type { SupervisorDb } from "../db/db.js";
import type { Session } from "../types.js";
import { applyMemoryUpdate, readShadowMemory, writeShadowLastEntryId } from "./memory.js";
import { formatShadowRunPrompt, parseShadowProtocolResponse } from "./protocol.js";
import { DEFAULT_PARENT_MESSAGE_LEVEL } from "../core/session-input-queue.js";

function parseMeta(meta: Session["meta"]): Record<string, unknown> {
	if (!meta) return {};
	return typeof meta === "string" ? JSON.parse(meta) : (meta as Record<string, unknown>);
}

function shouldRunShadowHook(session: Session): boolean {
	if (session.parentId !== null) return false;
	const meta = parseMeta(session.meta);
	if (meta.builtin === true) return false;
	if (meta.shadowOf !== undefined) return false;
	if (meta.shadowDisabled === true) return false;
	return true;
}

function formatHarnessMessages(messages: unknown[]): string {
	const lines: string[] = [];
	for (const item of messages) {
		if (!item || typeof item !== "object") continue;
		const record = item as { role?: string; content?: unknown };
		const role = record.role ?? "unknown";
		let text = "";
		if (typeof record.content === "string") {
			text = record.content;
		} else if (Array.isArray(record.content)) {
			text = record.content
				.map((part) => {
					if (!part || typeof part !== "object") return "";
					const p = part as { type?: string; text?: string };
					return p.type === "text" ? (p.text ?? "") : "";
				})
				.filter(Boolean)
				.join("\n");
		} else {
			text = JSON.stringify(record.content ?? item);
		}
		if (!text.trim()) continue;
		lines.push(`[${role}] ${text.trim()}`);
	}
	return lines.join("\n\n");
}

function findShadowChildSession(db: SupervisorDb, parentSessionId: number): Session | undefined {
	for (const row of db.children(parentSessionId)) {
		const meta = parseMeta(
			typeof row.meta === "string" ? JSON.parse(row.meta) : (row.meta as Session["meta"]),
		);
		if (meta.shadowOf === parentSessionId) {
			return {
				id: row.id,
				projectId: row.project_id,
				parentId: row.parent_id,
				sessionId: row.session_id,
				pid: row.pid,
				status: row.status,
				thinkingLevel: row.thinking_level,
				cwd: row.cwd,
				leafId: row.leaf_id,
				agentId: row.agent_id,
				branchType: row.branch_type as Session["branchType"],
				createdAt: new Date(row.created_at),
				lastActiveAt: new Date(row.last_active_at),
				meta,
			};
		}
	}
	return undefined;
}

async function ensureShadowChildSession(
	manager: SessionManager,
	db: SupervisorDb,
	parent: Session,
): Promise<Session | undefined> {
	const existing = findShadowChildSession(db, parent.id);
	if (existing) return existing;

	const shadowAgentId = findPackagedAgentId(db, "shadow");
	if (shadowAgentId === undefined) return undefined;

	return manager.spawn({
		parentId: parent.id,
		projectId: parent.projectId ?? undefined,
		agentId: shadowAgentId,
		cwd: parent.cwd,
		toolsPreset: "readonly",
		meta: {
			name: "Shadow",
			hidden: true,
			shadowOf: parent.id,
		},
	});
}

function enqueueParentFromProtocol(
	manager: SessionManager,
	parentSessionId: number,
	source: string,
	parent?: { message?: string; level?: number },
): void {
	const message = parent?.message?.trim();
	if (!message) return;
	const level = parent?.level ?? DEFAULT_PARENT_MESSAGE_LEVEL;
	void manager
		.submitSessionInput(parentSessionId, { message, level, source })
		.catch((error: unknown) => {
			const detail = error instanceof Error ? error.message : String(error);
			console.error(`shadow parent input failed [parent=${parentSessionId}]:`, detail);
		});
}

export async function runShadowHook(
	manager: SessionManager,
	db: SupervisorDb,
	parentSessionId: number,
	event: Extract<AgentHarnessEvent, { type: "agent_end" }>,
): Promise<void> {
	const row = db.get(parentSessionId);
	if (!row) return;
	const parent: Session = {
		id: row.id,
		projectId: row.project_id,
		parentId: row.parent_id,
		sessionId: row.session_id,
		pid: row.pid,
		status: row.status,
		thinkingLevel: row.thinking_level,
		cwd: row.cwd,
		leafId: row.leaf_id,
		agentId: row.agent_id,
		branchType: row.branch_type as Session["branchType"],
		createdAt: new Date(row.created_at),
		lastActiveAt: new Date(row.last_active_at),
		meta: parseMeta(typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta),
	};

	if (!shouldRunShadowHook(parent)) return;
	if (parent.projectId == null) return;

	const latestTurn = formatHarnessMessages(event.messages ?? []);
	if (!latestTurn.trim()) return;

	const shadowChild = await ensureShadowChildSession(manager, db, parent);
	if (!shadowChild) return;

	const memory = readShadowMemory(parent.projectId, parent.id);
	const prompt = formatShadowRunPrompt(memory, latestTurn);

	try {
		await manager.prompt(shadowChild.id, prompt);
		await manager.waitForSessionIdle(shadowChild.id, { timeoutMs: 120_000 });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`shadow hook prompt failed [parent=${parent.id}]:`, message);
		return;
	}

	const shadowRuntime = manager.getRuntime(shadowChild.id);
	const responseText = shadowRuntime?.getLastAssistantText() ?? "";
	const protocol = parseShadowProtocolResponse(responseText);
	if (protocol) {
		applyMemoryUpdate(parent.projectId, parent.id, protocol.memory);
		enqueueParentFromProtocol(
			manager,
			parent.id,
			`shadow:${shadowChild.agentId ?? "internal"}`,
			protocol.parent,
		);
	}

	const leaf = db.get(parent.id)?.leaf_id;
	if (leaf) {
		writeShadowLastEntryId(parent.projectId, parent.id, leaf);
	}
}
