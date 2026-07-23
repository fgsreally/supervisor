import { randomUUID } from "node:crypto";
import {
  activeTaskPaths,
  readTaskArtifact,
  taskArtifactPath,
  writeTaskArtifact,
} from "./task-artifacts.js";
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
  sessionDir: string,
  meta: Record<string, unknown>,
  patchMeta: (patch: Record<string, unknown>) => void,
  args: string,
): Promise<{ ok: boolean; message: string }> {
  const trimmed = args.trim();
  const [first = "", ...rest] = trimmed.split(/\s+/);
  const actions = new Set(["status", "pause", "resume", "complete", "blocked", "cancel"]);
  const action = actions.has(first) ? first : trimmed ? "create" : "status";
  const tail = actions.has(first) ? rest.join(" ") : trimmed;
  let path = activeTaskPaths(meta).find((item) => item.includes("/goal-"));

  if (action === "create") {
    if (!tail) return { ok: false, message: "objective is required" };
    if (path) return { ok: false, message: "An active Goal already exists" };
    path = taskArtifactPath("goal");
    await writeTaskArtifact(sessionDir, path, {
      type: "goal",
      title: tail.split("\n")[0]!.slice(0, 120),
      status: "active",
      body: `# Goal\n\n${tail}`,
    });
    const tasks = [...new Set([...activeTaskPaths(meta), path])];
    patchMeta({ tasks, currentTask: path });
    return { ok: true, message: `Goal created: ${path}` };
  }

  if (!path) {
    return {
      ok: action === "status",
      message: "No active Goal.",
    };
  }

  const artifact = await readTaskArtifact(sessionDir, path);
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
  await writeTaskArtifact(sessionDir, path, {
    type: "goal",
    title: artifact.title,
    status,
    body,
  });
  if (status === "completed" || status === "cancelled") {
    const tasks = activeTaskPaths(meta).filter((item) => item !== path);
    patchMeta({
      tasks,
      currentTask: meta.currentTask === path ? (tasks.at(-1) ?? null) : meta.currentTask,
    });
  }
  return { ok: true, message: `Goal ${status}: ${path}` };
}

async function executePlanCommand(
  sessionDir: string,
  meta: Record<string, unknown>,
  patchMeta: (patch: Record<string, unknown>) => void,
): Promise<{ ok: boolean; message: string }> {
  const existing = activeTaskPaths(meta).find((item) => item.includes("/plan-"));
  if (existing) {
    return { ok: true, message: `Plan mode is already active: ${existing}` };
  }
  const path = taskArtifactPath("plan");
  await writeTaskArtifact(sessionDir, path, {
    type: "plan",
    title: "Implementation plan",
    status: "planning",
    body: "# Implementation plan\n\nWrite the plan here.",
  });
  const tasks = [...new Set([...activeTaskPaths(meta), path])];
  patchMeta({ tasks, currentTask: path });
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
  const meta = JSON.parse(session.meta || "{}") as Record<string, unknown>;
  const sessionDir = await ensureSessionDir(options.projectId, options.sessionId);
  const patchMeta = (patch: Record<string, unknown>) => {
    options.db.updateMeta(options.sessionId, patch);
  };

  const result =
    name === "plan"
      ? await executePlanCommand(sessionDir, meta, patchMeta)
      : await executeGoalCommand(sessionDir, meta, patchMeta, options.args ?? "");

  const raw = `/${name}${options.args?.trim() ? ` ${options.args.trim()}` : ""}`;
  appendSlashMessage(options.db, options.sessionId, "slash_input", raw, { name });
  appendSlashMessage(options.db, options.sessionId, "slash_output", result.message, {
    name,
    isError: !result.ok,
  });
  if (!result.ok) throw new Error(result.message);
}
