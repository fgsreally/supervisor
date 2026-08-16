import type { SupervisorDb } from "../db/db.js";
import type { Project } from "../types.js";
import { commitAll } from "../utils/git.js";
import { normalizeProjectDescription } from "./project-description.js";
import { runWatson } from "./watson.js";
import { Type } from "typebox";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProjectRuntimeSpec {
  description: string;
}

const ProjectRuntimeSpecSchema = Type.Object({
  description: Type.String(),
});

/** One UI entry exposed by the session's project runtime. */
export interface SessionServiceApp {
  name: string;
  port: number;
  /** Tool-allocated values for ${PORT1}, ${PORT2}, ... in startCommand. */
  portEnv?: Record<string, number>;
  path?: string;
  startCommand?: string;
  jobId?: string;
  pid?: number | null;
}

/**
 * Session.meta.services — one project runtime per session.
 * Agent registers commands + apps; sleep/pid fields are system-managed.
 */
export interface SessionServicesMeta {
  status: "starting" | "running" | "active" | "stopped" | "idle" | "error" | "unregistered";
  installCommand?: string;
  startCommand: string;
  stopCommand?: string;
  destroyCommand?: string;
  apps?: SessionServiceApp[];
  /** @deprecated use destroyCommand */
  uninstallCommand?: string;
  startedAt?: string;
  installedAt?: string;
  lastActiveAt?: number;
  /** System-managed idle deadline (lastActiveAt + sleep window). */
  sleepAt?: number;
  error?: string;
  resolvedStartCommand?: string;
  jobId?: string;
  pid?: number | null;
}

export function buildProjectRuntimeInstructions(project: Pick<Project, "name" | "cwd">): string {
  return [
    "Complete project analysis and initialization in this order:",
    "1. Verify that git is installed and the current directory is a git repository; run git init if necessary, but do not modify remotes.",
    "2. Inspect the README, package manifests, CI, formatting/check configuration, existing Agent instructions, and project structure.",
    "3. Create or rewrite AGENTS.md at the project root, similar to Claude Code `/init`:",
    "   - Document the project purpose, major directories, test/check commands, coding conventions, runtime notes, and modification boundaries.",
    "   - It must contain the fixed `## \u672c\u5730\u5f00\u53d1\u670d\u52a1` section so future coding agents can read it without rescanning the repository:",
    "     ```markdown",
    "     ## \u672c\u5730\u5f00\u53d1\u670d\u52a1",
    "     - Install: `<install command, optional>`",
    "     - Start: `<long-running start command; use placeholders such as ${PORT} / ${API_PORT} for ports>`",
    "     - Stop: `<idle shutdown command, optional>`",
    "     - Destroy: `<archive/delete cleanup command, optional>`",
    "     ```",
    "   - Do not write entry ports or paths in AGENTS.md.",
    "   - Use concise Markdown, do not write secrets or invent commands; keep it under 200 lines when possible.",
    "   - If AGENTS.md already exists, refactor it to match the project (merge duplicates and fix stale guidance) while preserving valid constraints; keep exactly one Local Development Services section.",
    "4. Do not commit or push. Supervisor will commit the changes after parsing succeeds.",
    "5. Call the submit_result tool when finished. Its result must be the JSON object below; this ends the task.",
    "Result shape:",
    "{",
    '  "description": "A Chinese project description of 200-600 characters"',
    "}",
    "",
    "Constraints:",
    "- Do not commit or push; do not write secrets.",
    "- Put only install/start/stop/destroy commands in Local Development Services; do not create a separate script unless the project already uses one.",
    "- Do not invent or fill in entry ports/paths.",
    "",
    `Project name: ${project.name}`,
    `Path: ${project.cwd}`,
  ].join("\n");
}

/** Collect `${NAME}`, `$NAME`, `%NAME%` placeholders from a command. */
export function extractPortPlaceholders(command: string | null | undefined): string[] {
  if (!command) return [];
  const names = new Set<string>();
  for (const match of command.matchAll(/\$\{([A-Z_][A-Z0-9_]*)\}/g)) {
    if (match[1]) names.add(match[1]);
  }
  for (const match of command.matchAll(/(?<![A-Za-z0-9_])\$([A-Z_][A-Z0-9_]*)/g)) {
    if (match[1]) names.add(match[1]);
  }
  for (const match of command.matchAll(/%([A-Z_][A-Z0-9_]*)%/g)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
}

export function parseProjectRuntimeSpec(rawInput: unknown): ProjectRuntimeSpec {
  let raw = rawInput;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      throw new Error("项目解析未返回有效 JSON");
    }
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("项目解析未返回有效 JSON");
  }
  const row = raw as Record<string, unknown>;
  const description = normalizeProjectDescription(
    typeof row.description === "string" ? row.description : "",
  );
  if (!description) throw new Error("项目解析缺少 description");
  return { description };
}

/** Run Watson project parse (structured via terminating submit_result tool). */
export async function runProjectRuntimeParse(options: {
  db: SupervisorDb;
  project: Project;
}): Promise<ProjectRuntimeSpec> {
  const agentsPath = join(options.project.cwd, "AGENTS.md");
  const run = await runWatson({
    mode: "agent",
    cwd: options.project.cwd,
    kind: "project-parse",
    resultSchema: ProjectRuntimeSpecSchema,
    prompt: buildProjectRuntimeInstructions(options.project),
    injectSystem:
      "This task must create or rewrite AGENTS.md at the project root with the four commands under `## \u672c\u5730\u5f00\u53d1\u670d\u52a1`, omit entry ports/paths, and call submit_result with the description.",
  });

  if (run.result == null) {
    throw new Error("项目解析未得到 submit_result 结果");
  }
  const agents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
  if (!agents.trim()) throw new Error("项目解析未创建有效的 AGENTS.md");
  return parseProjectRuntimeSpec(run.result);
}

export async function applyProjectRuntimeParse(
  db: SupervisorDb,
  projectId: number,
  spec: ProjectRuntimeSpec,
): Promise<void> {
  const project = db.getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  await commitAll(project.cwd, "chore: initialize project for supervisor");

  db.updateProject(projectId, { description: spec.description });
}

export { normalizeProjectDescription };
