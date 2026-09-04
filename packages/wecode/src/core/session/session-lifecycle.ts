/** Session lifecycle helpers that are not agent tools. */
import type { AgentHarnessEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { hasPendingAsks } from "../../tools/ask/tool.js";
import type { WecodeDb } from "../../db/db.js";
// WecodeDb used by Watson cleanup retry path
import {
  commitAll,
  getGitDiffStat,
  getGitStatusPorcelain,
  resolveSessionGitContext,
} from "../../utils/git.js";
import { sessionLog, sessionLogEvent } from "../../utils/session-log.js";
import { maybeRunRollingCompaction } from "./compaction/rolling.js";
import type { SessionRuntime } from "./session-runtime.js";
import type {
  CommitSessionOptions,
  CommitSessionResult,
  Session,
  SessionRow,
  SpawnSessionOptions,
} from "../../types.js";
import type { JobManager } from "../jobs/jobs.js";
import { runWatson } from "../agent/watson.js";
import { mapRowToSession, parseSessionMeta } from "./session-fields.js";

export type SessionLifecycleDb = Pick<
  WecodeDb,
  | "get"
  | "list"
  | "updateMeta"
  | "updateStatus"
  | "updateCwd"
  | "updateSessionFields"
  | "listProviders"
  | "listModelsByProvider"
  | "getProvider"
  | "getModel"
  | "getProject"
>;

/** Convert a SessionRow to the Session type expected by callers. */
function rowToSession(row: SessionRow, _db?: unknown): Session {
  return mapRowToSession(row);
}

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

export function isDefaultSessionName(
  title: string | null | undefined,
  sessionId: number,
  agentDisplayName?: string | null,
): boolean {
  if (typeof title !== "string" || !title.trim()) return true;
  if (title === "New chat") return true;
  if (agentDisplayName && title === agentDisplayName) return true;
  if (title === `Session ${String(sessionId).slice(0, 8)}`) return true;
  return false;
}

function fallbackCommitMessage(sessionId: number): string {
  return `sv: session ${String(sessionId).slice(0, 8)}`;
}

export async function commitSessionChanges(
  sessionId: number,
  cwd: string,
  db: Pick<
    WecodeDb,
    | "get"
    | "getProject"
    | "updateMeta"
    | "listProviders"
    | "listModelsByProvider"
    | "getProvider"
    | "getModel"
  >,
  options: CommitSessionOptions = {},
  summaryText?: string,
): Promise<CommitSessionResult | null> {
  const row = db.get(sessionId);
  if (!row) throw new Error(`Session ${sessionId} not found`);
  const projectCwd = row.project_id != null ? db.getProject(row.project_id)?.cwd : undefined;
  const git = resolveSessionGitContext({
    sessionId,
    cwd,
    projectCwd,
  });
  if (!git?.worktreeEnabled) {
    throw new Error(
      "Session has no git worktree; commit is only available for root sessions in a git repo",
    );
  }

  const status = await getGitStatusPorcelain(cwd);
  if (!status.trim()) return null;

  let message = options.message?.trim() || fallbackCommitMessage(sessionId);
  if (!options.message?.trim()) {
    try {
      const diffStat = (await getGitDiffStat(cwd)) || status;
      const run = await runWatson({
        mode: "simple",
        sessionId,
        kind: "commit-message",
        prompt: [
          "Write a concise git commit subject line for the latest work.",
          "Return only one line, at most 72 characters, in imperative mood.",
          "",
          `Turn summary: ${(summaryText ?? "Agent changes").slice(0, 800)}`,
          `Diff stat:\n${diffStat.slice(0, 1200)}`,
        ].join("\n"),
      });
      message = run.text.split("\n")[0]?.trim().slice(0, 72) || message;
    } catch {
      // keep fallback message
    }
  }

  const commit = await commitAll(cwd, message);
  if (!commit) return null;

  const rawMeta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
  const previousGit =
    rawMeta && typeof rawMeta === "object" && "git" in rawMeta && rawMeta.git
      ? (rawMeta.git as Record<string, unknown>)
      : {};
  db.updateMeta(sessionId, { git: { ...previousGit, lastCommit: commit } });

  return commit;
}

async function maybeAutoNameSession(
  sessionId: number,
  event: Extract<AgentHarnessEvent, { type: "agent_end" }>,
  db: Pick<
    WecodeDb,
    | "get"
    | "updateSessionFields"
    | "listProviders"
    | "listModelsByProvider"
    | "getProvider"
    | "getModel"
  >,
): Promise<void> {
  const row = db.get(sessionId);
  if (!row) return;
  if (!isDefaultSessionName(row.title, sessionId)) return;

  const userText = findFirstUserText(event.messages);
  const assistantText = findLastAssistantText(event.messages);
  if (!userText || !assistantText) return;

  try {
    const run = await runWatson({
      mode: "simple",
      sessionId,
      kind: "session-title",
      prompt: [
        "Generate a short chat session title (6-20 Chinese or English characters).",
        "Return only the title text without quotes.",
        "",
        `User: ${userText.slice(0, 500)}`,
        `Assistant: ${assistantText.slice(0, 500)}`,
      ].join("\n"),
    });
    const title = run.text
      .replace(/^["'`]+|["'`]+$/g, "")
      .slice(0, 40)
      .trim();
    if (title) db.updateSessionFields(sessionId, { title });
  } catch {
    // skip auto naming on utility errors
  }
}

export async function prepareSessionLifecycleSpawn(
  db: SessionLifecycleDb,
  session: Session,
  options: SpawnSessionOptions,
  agentDisplayName?: string,
  _jobs?: JobManager,
): Promise<Session> {
  const initialName =
    options.title ??
    (typeof options.meta?.name === "string" ? options.meta.name : undefined) ??
    agentDisplayName ??
    undefined;
  const isBuiltin = options.isBuiltin === true || session.isBuiltin;

  const needsOwnWorktree = options.spawnType === "fork";
  if ((options?.parentId && !needsOwnWorktree) || isBuiltin) {
    if (initialName) {
      db.updateSessionFields(session.id, { title: initialName, isBuiltin });
      return rowToSession(db.get(session.id)!, db);
    }
    if (isBuiltin !== session.isBuiltin) {
      db.updateSessionFields(session.id, { isBuiltin });
    }
    return session;
  }

  db.updateSessionFields(session.id, {
    title: initialName ?? "New chat",
    isBuiltin,
  });
  return rowToSession(db.get(session.id)!, db);
}

export function handleSessionLifecycleAgentEnd(
  sessionId: number,
  runtime: SessionRuntime,
  event: AgentHarnessEvent,
  db: SessionLifecycleDb,
): void {
  if (event.type !== "agent_end" || !event.messages) return;
  const session = db.get(sessionId);
  if (!session) return;
  if (hasPendingAsks(String(sessionId))) return;

  void (async () => {
    await maybeRunRollingCompaction(
      String(sessionId),
      runtime,
      event,
      parseSessionMeta(session.meta),
      db,
    );
    await maybeAutoNameSession(sessionId, event, db);
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    sessionLogEvent(sessionId, "error", "runtime.sessionLifecycleFailed", {
      id: sessionId,
      error: message,
    });
  });
}
