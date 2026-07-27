import type { SupervisorDb } from "../db/db.js";
import type { Project } from "../types.js";
import { commitAll } from "../utils/git.js";
import { normalizeProjectDescription } from "./project-description.js";
import type { ProjectScriptInput, ProjectScriptKind } from "./project-scripts.js";
import { runWatsonTask } from "./watson.js";

export interface ProjectRuntimeSpec {
  description: string;
  scripts: ProjectScriptInput[];
}

/** Session.meta snapshot for a running project service stack. */
export interface SessionServicesMeta {
  scripts: Array<{
    scriptId: number;
    kind: ProjectScriptKind;
    name: string;
    command: string;
    resolvedCommand: string;
    jobId?: string;
    pid?: number | null;
  }>;
  portEnv: Record<string, string>;
  startedAt?: string;
  status: "starting" | "running" | "stopped" | "error";
  error?: string;
}

export function buildProjectRuntimeInstructions(project: Pick<Project, "name" | "cwd">): string {
  return [
    "请按顺序完成项目解析：",
    "1. 确认 git 已安装，且当前目录是 git 仓库（必要时 git init，不要改远程）。",
    "2. 探查 README / 包管理清单 / 脚本，整理依赖安装、长期服务启动、关闭命令。",
    "   - 若不需要安装/启动/销毁，scripts 用空数组 []。",
    "3. 若有需启动的服务：端口改为命令占位（如 `${PORT}` / `${API_PORT}`），最小必要改动。",
    "4. 有文件改动则提交：`chore: make local service ports injectable for supervisor`。",
    "5. 完成后必须调用工具 submit_result，参数 result 为下方 JSON 对象（任务以此结束）。",
    "结果对象格式：",
    "{",
    '  "description": "中文项目描述，200-600字",',
    '  "scripts": [',
    '    { "kind": "install", "name": "deps", "command": "pnpm install" },',
    '    { "kind": "start", "name": "web", "command": "PORT=${PORT} pnpm dev" },',
    '    { "kind": "destroy", "name": "web", "command": "echo stop" }',
    "  ]",
    "}",
    "",
    "约束：",
    "- kind 仅限 install | start | destroy；command 为空的项不要输出。",
    "- 启动命令里用 `${PORT}` 占位；不要单独返回 portEnvVars。",
    "- 不要 push；不要写密钥。",
    "",
    `项目名：${project.name}`,
    `路径：${project.cwd}`,
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

function asScriptKind(value: unknown): ProjectScriptKind | null {
  if (value === "install" || value === "start" || value === "destroy") return value;
  return null;
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

  const scripts: ProjectScriptInput[] = [];
  if (Array.isArray(row.scripts)) {
    for (const item of row.scripts) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const kind = asScriptKind(entry.kind);
      const command = typeof entry.command === "string" ? entry.command.trim() : "";
      if (!kind || !command) continue;
      scripts.push({
        kind,
        name:
          typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : kind,
        command,
      });
    }
  } else {
    // Backward-compatible single-command fields
    for (const kind of ["install", "start", "destroy"] as const) {
      const key = `${kind}Command`;
      const command = typeof row[key] === "string" ? row[key].trim() : "";
      if (command && command.toLowerCase() !== "null") {
        scripts.push({ kind, name: kind, command });
      }
    }
  }

  return { description, scripts };
}

/** Run Watson project parse (structured via terminating submit_result tool). */
export async function runProjectRuntimeParse(options: {
  db: SupervisorDb;
  project: Project;
}): Promise<ProjectRuntimeSpec> {
  const run = await runWatsonTask<unknown>({
    db: options.db,
    cwd: options.project.cwd,
    kind: "project-parse",
    structured: true,
    prompt: buildProjectRuntimeInstructions(options.project),
    injectSystem: "本任务必须调用 submit_result 提交 description + scripts。",
  });

  if (run.result == null) {
    throw new Error("项目解析未得到 submit_result 结果");
  }
  return parseProjectRuntimeSpec(run.result);
}

export async function applyProjectRuntimeParse(
  db: SupervisorDb,
  projectId: number,
  spec: ProjectRuntimeSpec,
): Promise<void> {
  const project = db.getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  await commitAll(
    project.cwd,
    "chore: make local service ports injectable for supervisor",
  );

  db.replaceProjectScripts(projectId, spec.scripts);

  db.updateProject(projectId, { description: spec.description });
}

export { normalizeProjectDescription };
