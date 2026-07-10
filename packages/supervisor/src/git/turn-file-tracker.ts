import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { AgentEvent } from "@earendil-works/pi-agent-core";

export interface TurnFileChanges {
	added: string[];
	modified: string[];
	deleted: string[];
}

export interface TurnRecord {
	index: number;
	startedAt: number;
	endedAt: number;
	files: TurnFileChanges;
}

interface PendingTool {
	toolName: string;
	args: Record<string, unknown>;
	fileExisted?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

function strArg(args: Record<string, unknown>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const v = args[key];
		if (typeof v === "string" && v.length > 0) return v;
	}
	return undefined;
}

/** Normalize to project-relative path when under cwd. */
export function normalizeFilePath(cwd: string, rawPath: string): string {
	const abs = isAbsolute(rawPath) ? resolve(rawPath) : resolve(cwd, rawPath);
	const rel = relative(cwd, abs);
	if (!rel.startsWith("..")) return rel.replace(/\\/g, "/");
	return abs.replace(/\\/g, "/");
}

function parseBashFileChanges(cwd: string, command: string): TurnFileChanges {
	const added: string[] = [];
	const modified: string[] = [];
	const deleted: string[] = [];

	const segments = command
		.split(/&&|\|\||;|\n/)
		.map((s) => s.trim())
		.filter(Boolean);
	for (const segment of segments) {
		const rm = segment.match(/^rm\s+(?:-[a-zA-Z]+\s+)*(.+)$/i);
		if (rm) {
			for (const token of rm[1]!.split(/\s+/)) {
				if (token.startsWith("-")) continue;
				deleted.push(normalizeFilePath(cwd, token.replace(/^['"]|['"]$/g, "")));
			}
			continue;
		}

		const mv = segment.match(/^mv\s+(\S+)\s+(\S+)/i);
		if (mv) {
			deleted.push(normalizeFilePath(cwd, mv[1]!.replace(/^['"]|['"]$/g, "")));
			modified.push(normalizeFilePath(cwd, mv[2]!.replace(/^['"]|['"]$/g, "")));
			continue;
		}

		const cp = segment.match(/^cp\s+(?:-[a-zA-Z]+\s+)*(\S+)\s+(\S+)/i);
		if (cp) {
			modified.push(normalizeFilePath(cwd, cp[2]!.replace(/^['"]|['"]$/g, "")));
		}
	}

	return { added, modified, deleted };
}

/**
 * Tracks file mutations for one agent run (one user prompt → agent_end).
 */
export class TurnFileTracker {
	private cwd: string;
	private turnIndex: number;
	private startedAt = 0;
	private added = new Set<string>();
	private modified = new Set<string>();
	private deleted = new Set<string>();
	private pending = new Map<string, PendingTool>();

	constructor(cwd: string, turnIndex: number) {
		this.cwd = cwd;
		this.turnIndex = turnIndex;
	}

	startTurn(): void {
		this.startedAt = Date.now();
		this.added.clear();
		this.modified.clear();
		this.deleted.clear();
		this.pending.clear();
	}

	onToolStart(toolCallId: string, toolName: string, args: unknown): void {
		const record = asRecord(args);
		if (!record) return;

		let fileExisted: boolean | undefined;
		const path = strArg(record, "path", "file_path");
		if (toolName === "write" && path) {
			const abs = isAbsolute(path) ? resolve(path) : resolve(this.cwd, path);
			fileExisted = existsSync(abs);
		}

		this.pending.set(toolCallId, { toolName, args: record, fileExisted });
	}

	onToolEnd(toolCallId: string, toolName: string, isError: boolean): void {
		if (isError) {
			this.pending.delete(toolCallId);
			return;
		}

		const pending = this.pending.get(toolCallId);
		this.pending.delete(toolCallId);
		const args = pending?.args;
		const effectiveName = pending?.toolName ?? toolName;

		if (effectiveName === "edit") {
			const path = args ? strArg(args, "path", "file_path") : undefined;
			if (path) this.modified.add(normalizeFilePath(this.cwd, path));
			return;
		}

		if (effectiveName === "write") {
			const path = args ? strArg(args, "path", "file_path") : undefined;
			if (!path) return;
			const normalized = normalizeFilePath(this.cwd, path);
			if (pending?.fileExisted) this.modified.add(normalized);
			else this.added.add(normalized);
			return;
		}

		if (effectiveName === "bash" && args) {
			const command = strArg(args, "command");
			if (!command) return;
			const parsed = parseBashFileChanges(this.cwd, command);
			for (const p of parsed.added) this.added.add(p);
			for (const p of parsed.modified) this.modified.add(p);
			for (const p of parsed.deleted) this.deleted.add(p);
		}
	}

	finishTurn(): TurnRecord {
		return {
			index: this.turnIndex,
			startedAt: this.startedAt,
			endedAt: Date.now(),
			files: {
				added: [...this.added].sort(),
				modified: [...this.modified].sort(),
				deleted: [...this.deleted].sort(),
			},
		};
	}
}

export function mergeTurnIntoMeta(meta: Record<string, unknown>, turn: TurnRecord): Record<string, unknown> {
	const existing = Array.isArray(meta.turns) ? (meta.turns as TurnRecord[]) : [];
	return { ...meta, turns: [...existing, turn] };
}

export function handleAgentEventForTurnFiles(
	tracker: TurnFileTracker | undefined,
	event: AgentEvent,
): TurnRecord | undefined {
	if (!tracker) return undefined;

	switch (event.type) {
		case "agent_start":
			tracker.startTurn();
			return undefined;
		case "tool_execution_start":
			tracker.onToolStart(event.toolCallId, event.toolName, event.args);
			return undefined;
		case "tool_execution_end":
			tracker.onToolEnd(event.toolCallId, event.toolName, event.isError);
			return undefined;
		case "agent_end":
			return tracker.finishTurn();
		default:
			return undefined;
	}
}
