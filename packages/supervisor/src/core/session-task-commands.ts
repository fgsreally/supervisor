import { randomUUID } from "node:crypto";
import { readTaskArtifact, taskArtifactPath, writeTaskArtifact } from "./task-artifacts.js";
import { ensureSessionDir } from "./session-files.js";
import type { SupervisorDb } from "../db/db.js";
import type { SlashCommandInfo } from "./session-runtime.js";

export const TASK_SLASH_COMMANDS: SlashCommandInfo[] = [
  {
    name: "goal",
    description: "Create or inspect a persistent goal",
    source: "custom",
    icon: "target",
    arguments: { type: "text", required: false, placeholder: "Describe the goal or action" },
  },
  {
    name: "plan",
    description: "Enter plan mode and create a Session-owned Markdown plan",
    source: "custom",
    icon: "map",
    arguments: { type: "none" },
  },
];

const FINISHED_GOAL_STATUSES = new Set(["completed", "cancelled"]);

export function isTaskSlashCommand(name: string): boolean {
  const normalized = name.replace(/^\//, "").toLowerCase();
  return TASK_SLASH_COMMANDS.some((command) => command.name === normalized);
}

export function mergeSlashCommands(commands: SlashCommandInfo[]): SlashCommandInfo[] {
  const merged = new Map<string, SlashCommandInfo>();
  for (const command of TASK_SLASH_COMMANDS) merged.set(command.name, command);
  for (const command of commands) {
    const name = command.name.replace(/^\//, "").toLowerCase();
    merged.set(name, { ...command, name });
  }
  return [...merged.values()];
}

function appendSlashMessage(
  db: SupervisorDb,
  sessionId: number,
  customType: "slash_input" | "slash_output",
  content: string,
  details: Record<string, unknown>,
): void {
  const entryId = randomUUID();
  const payload = JSON.stringify({
    id: entryId,
    type: "message",
    role: "custom",
    customType,
    content,
    details,
    display: true,
    parentId: null,
  });
  db.db
    .prepare(
      `INSERT INTO messages (entry_id, session_id, parent_entry_id, type, payload, meta, is_old, message_role, search_text, created_at)
       VALUES (?, ?, NULL, 'message', ?, '{}', 0, 'custom', ?, ?)`,
    )
    .run(entryId, sessionId, payload, content, Date.now());
  db.db
    .prepare("UPDATE sessions SET leaf_id = ?, last_active_at = ? WHERE id = ?")
    .run(entryId, Date.now(), sessionId);
}

async function executeGoalCommand(
  db: SupervisorDb,
  sessionId: number,
  sessionDir: string,
  args: string,
): Promise<{ ok: boolean; message: string }> {
  const trimmed = args.trim();
  const [first = "", ...rest] = trimmed.split(/\s+/);
  const actions = new Set(["status", "pause", "resume", "complete", "blocked", "cancel"]);
  const action = actions.has(first) ? first : trimmed ? "create" : "status";
  const tail = actions.has(first) ? rest.join(" ") : trimmed;
  const task = db
    .listSessionTasks(sessionId)
    .find((item) => item.kind === "goal" && !FINISHED_GOAL_STATUSES.has(item.status ?? ""));

  if (action === "create") {
    if (!tail) return { ok: false, message: "objective is required" };
    if (task) return { ok: false, message: "An active Goal already exists" };
    const path = taskArtifactPath("goal");
    const title = tail.split("\n")[0]!.slice(0, 120);
    await writeTaskArtifact(sessionDir, path, {
      type: "goal",
      title,
      status: "active",
      body: `# Goal\n\n${tail}`,
    });
    const row = db.upsertSessionTask({ sessionId, path, kind: "goal", title, status: "active" });
    db.updateSessionFields(sessionId, { currentTaskId: row.id });
    return { ok: true, message: `Goal created: ${path}` };
  }

  if (!task) {
    return { ok: action === "status", message: "No active Goal." };
  }

  const artifact = await readTaskArtifact(sessionDir, task.path);
  if (!artifact) return { ok: false, message: "Goal file is missing." };
  if (action === "status") return { ok: true, message: artifact.content };

  const status = {
    pause: "paused",
    resume: "active",
    complete: "completed",
    blocked: "blocked",
    cancel: "cancelled",
  }[action];
  if (!status) return { ok: false, message: `Unknown goal action: ${action}` };

  const body =
    artifact.content.replace(/^---[\s\S]*?---\s*/m, "") +
    (tail && (action === "pause" || action === "blocked")
      ? `\n\n## Status reason\n\n${tail}`
      : "");
  await writeTaskArtifact(sessionDir, task.path, {
    type: "goal",
    title: artifact.title,
    status,
    body,
  });
  const updated = db.upsertSessionTask({
    sessionId,
    path: task.path,
    kind: "goal",
    title: artifact.title,
    status,
  });
  if (FINISHED_GOAL_STATUSES.has(status)) {
    const current = db.get(sessionId);
    if (current?.current_task_id === updated.id) {
      db.updateSessionFields(sessionId, { currentTaskId: null });
    }
  }
  return { ok: true, message: `Goal ${status}: ${task.path}` };
}

async function executePlanCommand(
  db: SupervisorDb,
  sessionId: number,
  sessionDir: string,
): Promise<{ ok: boolean; message: string }> {
  const existing = db
    .listSessionTasks(sessionId)
    .find((item) => item.kind === "plan" && item.status !== "completed");
  if (existing) {
    return { ok: true, message: `Plan mode is already active: ${existing.path}` };
  }
  const path = taskArtifactPath("plan");
  await writeTaskArtifact(sessionDir, path, {
    type: "plan",
    title: "Implementation plan",
    status: "planning",
    body: "# Implementation plan\n\nWrite the plan here.",
  });
  const row = db.upsertSessionTask({
    sessionId,
    path,
    kind: "plan",
    title: "Implementation plan",
    status: "planning",
  });
  db.updateSessionFields(sessionId, { currentTaskId: row.id });
  return {
    ok: true,
    message: `Plan mode active. Write the plan to ${path}, then call ExitPlanMode.`,
  };
}

export async function executeTaskSlashCommand(options: {
  db: SupervisorDb;
  sessionId: number;
  projectId: number;
  name: string;
  args?: string;
}): Promise<void> {
  const name = options.name.replace(/^\//, "").toLowerCase();
  if (!isTaskSlashCommand(name)) throw new Error(`slash command /${name} not found`);

  const session = options.db.get(options.sessionId);
  if (!session) throw new Error(`Session ${options.sessionId} not found`);
  const sessionDir = await ensureSessionDir(options.projectId, options.sessionId);

  const result =
    name === "plan"
      ? await executePlanCommand(options.db, options.sessionId, sessionDir)
      : await executeGoalCommand(options.db, options.sessionId, sessionDir, options.args ?? "");

  const raw = `/${name}${options.args?.trim() ? ` ${options.args.trim()}` : ""}`;
  appendSlashMessage(options.db, options.sessionId, "slash_input", raw, { name });
  appendSlashMessage(options.db, options.sessionId, "slash_output", result.message, {
    name,
    isError: !result.ok,
  });
  if (!result.ok) throw new Error(result.message);
}
