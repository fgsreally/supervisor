import type { SupervisorDb } from "../../db/db.js";
import type { Project } from "../../types.js";
import { commitAll, findGitRoot } from "../../utils/git.js";
import { normalizeProjectDescription } from "./project-description.js";
import { runWatson } from "../agent/watson.js";
import { renderPromptTemplate } from "../resource/system-prompts.js";
import { Type } from "typebox";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProjectRuntimeSpec {
  description: string;
  services: ProjectServiceConfig;
}

export interface Service {
  name: string;
  startCommand: string;
  /** Legacy field; parsed Watson results no longer include entry paths. */
  path?: string;
}

export interface View {
  name: string;
  service: string;
  port: string;
  path: string;
}

/** @deprecated Use Service. */
export type ProjectServiceDefinition = Service;
/** @deprecated Use View. */
export type ProjectViewDefinition = View;

export interface ProjectServiceConfig {
  definitions: ProjectServiceDefinition[];
  views?: ProjectViewDefinition[];
  installCommand?: string;
  stopCommand?: string;
  destroyCommand?: string;
}

export interface ProjectServicesMeta extends ProjectServiceConfig {
  error?: string;
  updatedAt: string;
}

export function parseProjectServicesMeta(
  meta: Record<string, unknown> | null | undefined,
): ProjectServicesMeta | null {
  const raw = meta?.services;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.definitions)) {
    return null;
  }
  const definitions = value.definitions.filter(
    (item): item is ProjectServiceDefinition =>
      !!item &&
      typeof item === "object" &&
      typeof (item as ProjectServiceDefinition).name === "string" &&
      typeof (item as ProjectServiceDefinition).startCommand === "string",
  );
  const views = Array.isArray(value.views)
    ? value.views.filter(
        (item): item is ProjectViewDefinition =>
          !!item &&
          typeof item === "object" &&
          typeof (item as ProjectViewDefinition).name === "string" &&
          typeof (item as ProjectViewDefinition).service === "string" &&
          typeof (item as ProjectViewDefinition).port === "string" &&
          typeof (item as ProjectViewDefinition).path === "string",
      )
    : [];
  const optional = (key: string): string | undefined =>
    typeof value[key] === "string" && value[key].trim() ? value[key].trim() : undefined;
  return {
    definitions,
    ...(Array.isArray(value.views) ? { views } : {}),
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
      }),
    ),
    views: Type.Optional(
      Type.Array(
        Type.Object({
          name: Type.String(),
          service: Type.String(),
          port: Type.String(),
          path: Type.String(),
        }),
      ),
    ),
  }),
});

/** One UI entry exposed by the session's project runtime. */
export interface SessionService {
  name: string;
  port: number;
  /** Tool-allocated values for ${PORT1}, ${PORT2}, ... in startCommand. */
  portEnv?: Record<string, number>;
  path?: string;
  startCommand?: string;
  jobId?: string;
  pid?: number | null;
}

export interface SessionServiceView {
  name: string;
  service: string;
  port: number;
  path?: string;
}

/**
 * Session.meta.services — one project runtime per session.
 * Agent registers Services and Views; sleep/pid fields are system-managed.
 */
export interface SessionServicesMeta {
  installCommand?: string;
  startCommand: string;
  stopCommand?: string;
  destroyCommand?: string;
  services?: SessionService[];
  views?: SessionServiceView[];
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
  return renderPromptTemplate("project-parse", {
    projectName: project.name,
    projectPath: project.cwd,
    localServicesHeading: String.fromCodePoint(0x672c, 0x5730, 0x5f00, 0x53d1, 0x670d, 0x52a1),
  });
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
    const legacyPathValue = typeof service.path === "string" ? service.path.trim() : "";
    const legacyPath = legacyPathValue
      ? legacyPathValue.startsWith("/")
        ? legacyPathValue
        : `/${legacyPathValue}`
      : undefined;
    if (!name || !startCommand) throw new Error(`服务 ${index + 1} 缺少名称或启动命令`);
    const placeholders = extractPortPlaceholders(startCommand).filter((value) =>
      /^PORT[1-9]\d*$/.test(value),
    );
    if (
      placeholders.length === 0 ||
      !placeholders.every((value, placeholderIndex) => value === `PORT${placeholderIndex + 1}`)
    ) {
      throw new Error(
        `服务 ${name} 的启动命令必须使用连续的 \${PORT1} 占位符；` +
          `startCommand=${JSON.stringify(startCommand)}；` +
          `识别到的占位符=${JSON.stringify(placeholders)}`,
      );
    }
    return legacyPath ? { name, startCommand, path: legacyPath } : { name, startCommand };
  });
  const definitionNames = new Set(definitions.map((item) => item.name));
  const views = (Array.isArray(rawServices.views) ? rawServices.views : []).map(
    (item, index): ProjectViewDefinition => {
      if (!item || typeof item !== "object") throw new Error(`视图 ${index + 1} 无效`);
      const view = item as Record<string, unknown>;
      const name = typeof view.name === "string" ? view.name.trim() : "";
      const service = typeof view.service === "string" ? view.service.trim() : "";
      const port = typeof view.port === "string" ? view.port.trim() : "";
      const rawPath = typeof view.path === "string" ? view.path.trim() : "/";
      if (!name || !definitionNames.has(service) || !/^PORT[1-9]\d*$/.test(port)) {
        throw new Error(`视图 ${index + 1} 缺少有效的 name、service 或 port`);
      }
      const definition = definitions.find((item) => item.name === service)!;
      if (!extractPortPlaceholders(definition.startCommand).includes(port)) {
        throw new Error(`视图 ${name} 的端口 ${port} 未被服务 ${service} 使用`);
      }
      return { name, service, port, path: rawPath.startsWith("/") ? rawPath : `/${rawPath}` };
    },
  );
  const optional = (key: string): string | undefined => {
    const value = rawServices[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  return {
    description,
    services: {
      definitions,
      ...(Array.isArray(rawServices.views) ? { views } : {}),
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
  const existingAgents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
  const run = await runWatson({
    mode: "agent",
    cwd: options.project.cwd,
    kind: "project-parse",
    resultSchema: ProjectRuntimeSpecSchema,
    prompt: [
      buildProjectRuntimeInstructions(options.project),
      existingAgents.trim()
        ? `\nExisting AGENTS.md (preserve valid rules and improve it in place):\n\n${existingAgents}`
        : "\nNo existing AGENTS.md was found; create it.",
    ].join("\n"),
  });

  if (run.result == null) {
    throw new Error("项目解析未得到 submit_result 结果");
  }
  const agents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
  if (!agents.trim()) throw new Error("项目解析未创建有效的 AGENTS.md");
  const gitignorePath = join(options.project.cwd, ".gitignore");
  const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  if (!gitignore.trim()) throw new Error("项目解析未创建有效的 .gitignore");
  return parseProjectRuntimeSpec(run.result);
}

export async function applyProjectRuntimeParse(
  db: SupervisorDb,
  projectId: number,
  spec: ProjectRuntimeSpec,
): Promise<void> {
  const project = db.getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  if (!(await findGitRoot(project.cwd))) {
    throw new Error("项目解析未初始化 Git 仓库");
  }
  await commitAll(project.cwd, "chore: initialize project for supervisor");

  db.updateProject(projectId, {
    description: spec.description,
    parsedAt: Date.now(),
    meta: {
      ...project.meta,
      services: {
        ...spec.services,
        updatedAt: new Date().toISOString(),
      } satisfies ProjectServicesMeta,
    },
  });
}

export { normalizeProjectDescription };
