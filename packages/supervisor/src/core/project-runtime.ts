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
  services: ProjectServiceConfig;
}

export interface ProjectServiceDefinition {
  name: string;
  startCommand: string;
  path: string;
}

export interface ProjectServiceConfig {
  definitions: ProjectServiceDefinition[];
  installCommand?: string;
  stopCommand?: string;
  destroyCommand?: string;
}

export interface ProjectServicesMeta extends ProjectServiceConfig {
  status: "pending" | "ready" | "error";
  error?: string;
  updatedAt: string;
}

export function parseProjectServicesMeta(
  meta: Record<string, unknown> | null | undefined,
): ProjectServicesMeta | null {
  const raw = meta?.services;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    (value.status !== "pending" && value.status !== "ready" && value.status !== "error") ||
    !Array.isArray(value.definitions)
  ) {
    return null;
  }
  const definitions = value.definitions.filter(
    (item): item is ProjectServiceDefinition =>
      !!item &&
      typeof item === "object" &&
      typeof (item as ProjectServiceDefinition).name === "string" &&
      typeof (item as ProjectServiceDefinition).startCommand === "string" &&
      typeof (item as ProjectServiceDefinition).path === "string",
  );
  const optional = (key: string): string | undefined =>
    typeof value[key] === "string" && value[key].trim() ? value[key].trim() : undefined;
  return {
    status: value.status,
    definitions,
    installCommand: optional("installCommand"),
    stopCommand: optional("stopCommand"),
    destroyCommand: optional("destroyCommand"),
    error: optional("error"),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

const ProjectRuntimeSpecSchema = Type.Object({
  description: Type.String(),
  services: Type.Object({
    installCommand: Type.Optional(Type.String()),
    stopCommand: Type.Optional(Type.String()),
    destroyCommand: Type.Optional(Type.String()),
    definitions: Type.Array(
      Type.Object({
        name: Type.String(),
        startCommand: Type.String(),
        path: Type.String(),
      }),
    ),
  }),
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
    "     - Start: `<long-running start command; use placeholders such as ${PORT1} and ${PORT2} for ports>`",
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
    '  "description": "A Chinese project description of 200-600 characters",',
    '  "services": {',
    '    "installCommand": "optional project dependency installation command",',
    '    "stopCommand": "optional project-wide graceful stop command",',
    '    "destroyCommand": "optional project-wide cleanup command",',
    '    "definitions": [',
    "      {",
    '        "name": "short unique service name such as web or api",',
    '        "startCommand": "declared long-running start script using ${PORT1}, ${PORT2}, ...",',
    '        "path": "/"',
    "      }",
    "    ]",
    "  }",
    "}",
    "",
    "Constraints:",
    "- Do not commit or push; do not write secrets.",
    "- Put only install/start/stop/destroy commands in Local Development Services; do not create a separate script unless the project already uses one.",
    "- Return every long-running local development service. Use an empty definitions array when none exists.",
    "- Each startCommand must use consecutive ${PORT1}, ${PORT2}, ... placeholders instead of fixed ports.",
    "- Do not invent commands. Entry paths must begin with /.",
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
  if (!row.services || typeof row.services !== "object") {
    throw new Error("项目解析缺少 services");
  }
  const rawServices = row.services as Record<string, unknown>;
  if (!Array.isArray(rawServices.definitions)) throw new Error("项目解析缺少 services.definitions");
  const definitions = rawServices.definitions.map((item, index): ProjectServiceDefinition => {
    if (!item || typeof item !== "object") throw new Error(`服务 ${index + 1} 无效`);
    const service = item as Record<string, unknown>;
    const name = typeof service.name === "string" ? service.name.trim() : "";
    const startCommand =
      typeof service.startCommand === "string" ? service.startCommand.trim() : "";
    const path = typeof service.path === "string" ? service.path.trim() : "/";
    if (!name || !startCommand) throw new Error(`服务 ${index + 1} 缺少名称或启动命令`);
    const placeholders = extractPortPlaceholders(startCommand).filter((value) =>
      /^PORT[1-9]\d*$/.test(value),
    );
    if (
      placeholders.length === 0 ||
      !placeholders.every((value, placeholderIndex) => value === `PORT${placeholderIndex + 1}`)
    ) {
      throw new Error(`服务 ${name} 的启动命令必须使用连续的 \${PORT1} 占位符`);
    }
    return {
      name,
      startCommand,
      path: path.startsWith("/") ? path : `/${path}`,
    };
  });
  const optional = (key: string): string | undefined => {
    const value = rawServices[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  return {
    description,
    services: {
      definitions,
      installCommand: optional("installCommand"),
      stopCommand: optional("stopCommand"),
      destroyCommand: optional("destroyCommand"),
    },
  };
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

  db.updateProject(projectId, {
    description: spec.description,
    meta: {
      ...project.meta,
      services: {
        status: "ready",
        ...spec.services,
        updatedAt: new Date().toISOString(),
      } satisfies ProjectServicesMeta,
    },
  });
}

export { normalizeProjectDescription };
