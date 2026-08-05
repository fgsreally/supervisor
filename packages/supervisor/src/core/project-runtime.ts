import type { SupervisorDb } from "../db/db.js";
import type { Project } from "../types.js";
import { commitAll } from "../utils/git.js";
import { normalizeProjectDescription } from "./project-description.js";
import type { ProjectScriptInput, ProjectScriptKind } from "./project-scripts.js";
import { runWatson } from "./watson.js";
import { Type } from "typebox";

export interface ProjectRuntimeSpec {
  description: string;
  scripts: ProjectScriptInput[];
}

const ProjectRuntimeSpecSchema = Type.Object({
  description: Type.String(),
  scripts: Type.Array(
    Type.Object({
      kind: Type.Union([Type.Literal("install"), Type.Literal("start"), Type.Literal("destroy")]),
      name: Type.String(),
      command: Type.String(),
    }),
  ),
});

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
    "请按顺序完成项目解析和初始化：",
    "1. 确认 git 已安装，且当前目录是 git 仓库；必要时执行 git init，但不要修改远程。",
    "2. 探查 README、包管理清单、CI、格式化/检查配置、现有 Agent 指令和项目结构。",
    "3. 整理依赖安装、长期服务启动和关闭命令；若不需要则 scripts 返回空数组 []。",
    "4. 若有需启动的服务，确保端口可以通过命令行参数或环境变量传入。返回的启动命令使用 `${PORT}`、`${API_PORT}` 等占位符；多个服务使用不同变量。只做最小必要改动。",
    "5. 在项目根目录创建或补充 AGENTS.md，达到类似 Claude Code `/init` 的效果：",
    "   - 写清项目用途、主要目录、安装/启动/测试/检查命令、代码约定、运行时注意事项和修改边界。",
    "   - 使用简洁 Markdown，不写密钥，不猜测不存在的命令；新文件尽量不超过 200 行。",
    "   - 如果 AGENTS.md 已存在，必须逐字保留原内容，只能在末尾补充缺失信息。",
    "6. 不要自行 commit 或 push；Supervisor 会在解析成功后统一提交改动。",
    "7. 完成后必须调用工具 submit_result，参数 result 为下方 JSON 对象（任务以此结束）。",
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
    "- 不要 commit 或 push；不要写密钥。",
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
        name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : kind,
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
  const agentsPath = join(options.project.cwd, "AGENTS.md");
  const originalAgents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : null;
  const run = await runWatson({
    mode: "agent",
    cwd: options.project.cwd,
    kind: "project-parse",
    resultSchema: ProjectRuntimeSpecSchema,
    prompt: buildProjectRuntimeInstructions(options.project),
    injectSystem:
      "本任务必须创建或补充项目根目录 AGENTS.md，并调用 submit_result 提交 description + scripts。",
  });

  if (run.result == null) {
    throw new Error("项目解析未得到 submit_result 结果");
  }
  const agents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
  if (!agents.trim()) throw new Error("项目解析未创建有效的 AGENTS.md");
  if (originalAgents?.trim() && !agents.includes(originalAgents.trim())) {
    throw new Error("项目解析修改了现有 AGENTS.md 内容；只允许追加缺失信息");
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

  await commitAll(project.cwd, "chore: initialize project for supervisor");

  db.replaceProjectScripts(projectId, spec.scripts);

  db.updateProject(projectId, { description: spec.description });
}

export { normalizeProjectDescription };
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
