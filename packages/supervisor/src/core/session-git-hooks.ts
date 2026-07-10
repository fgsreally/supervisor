import type { AgentHarnessEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { SupervisorDb } from "../db/db.js";
import {
	commitAll,
	getGitDiffStat,
	getGitStatusPorcelain,
	parseSessionGitMeta,
	type SessionGitMeta,
} from "../git/git-worktree.js";
import type { CommitSessionOptions, CommitSessionResult } from "../types.js";
import { generateCommitMessage, generateSessionTitle, resolveTaggedModelAuth } from "../utils/utility-llm.js";

function findLastAssistantText(messages: AgentMessage[]): string {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role !== "assistant") continue;
		const content = message.content as string | Array<{ type: string; text?: string }>;
		if (typeof content === "string") return content.trim();
		return content
			.filter((part): part is { type: "text"; text: string } => part.type === "text" && !!part.text)
			.map((part) => part.text)
			.join("")
			.trim();
	}
	return "";
}

function findFirstUserText(messages: AgentMessage[]): string {
	for (const message of messages) {
		if (message.role !== "user") continue;
		const content = message.content;
		if (typeof content === "string") return content.trim();
		if (Array.isArray(content)) {
			return content
				.filter((part): part is { type: "text"; text: string } => part.type === "text")
				.map((part) => part.text)
				.join("")
				.trim();
		}
	}
	return "";
}

export function isDefaultSessionName(meta: Record<string, unknown>, sessionId: number): boolean {
	const name = meta.name;
	if (typeof name !== "string" || !name.trim()) return true;
	if (typeof meta.nameDefault === "string" && name === meta.nameDefault) return true;
	if (name === "New chat") return true;
	if (name === `Session ${String(sessionId).slice(0, 8)}`) return true;
	return false;
}

function fallbackCommitMessage(sessionId: number): string {
	return `pi: session ${String(sessionId).slice(0, 8)}`;
}

export async function commitSessionChanges(
	sessionId: number,
	cwd: string,
	meta: Record<string, unknown>,
	db: Pick<SupervisorDb, "updateMeta" | "listProviders" | "listModelsByProvider" | "getProvider">,
	options: CommitSessionOptions = {},
	summaryText?: string,
): Promise<CommitSessionResult | null> {
	const gitMeta = parseSessionGitMeta(meta);
	if (!gitMeta) {
		throw new Error("Session has no git worktree; commit is only available for root sessions in a git repo");
	}

	const status = await getGitStatusPorcelain(cwd);
	if (!status.trim()) return null;

	let message = options.message?.trim() || fallbackCommitMessage(sessionId);
	if (!options.message?.trim()) {
		const auth = await resolveTaggedModelAuth(db, "commit-message");
		if (auth) {
			try {
				const diffStat = (await getGitDiffStat(cwd)) || status;
				message = await generateCommitMessage(auth, summaryText ?? "Agent changes", diffStat);
			} catch {
				// keep fallback message
			}
		}
	}

	const commit = await commitAll(cwd, message);
	if (!commit) return null;

	const nextGit: SessionGitMeta = {
		...gitMeta,
		lastCommit: commit,
	};
	db.updateMeta(sessionId, { git: nextGit });
	return commit;
}

export async function maybeAutoNameSession(
	sessionId: number,
	meta: Record<string, unknown>,
	event: Extract<AgentHarnessEvent, { type: "agent_end" }>,
	db: Pick<SupervisorDb, "updateMeta" | "listProviders" | "listModelsByProvider" | "getProvider">,
): Promise<void> {
	if (!isDefaultSessionName(meta, sessionId)) return;

	const userText = findFirstUserText(event.messages);
	const assistantText = findLastAssistantText(event.messages);
	if (!userText || !assistantText) return;

	const auth = await resolveTaggedModelAuth(db, "session-title");
	if (!auth) return;

	try {
		const title = await generateSessionTitle(auth, userText, assistantText);
		if (!title) return;
		db.updateMeta(sessionId, { name: title });
	} catch {
		// skip auto naming on utility errors
	}
}
