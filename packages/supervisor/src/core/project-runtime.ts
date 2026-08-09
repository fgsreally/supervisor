import type { SupervisorDb } from "../db/db.js";
import type { Project } from "../types.js";
import { commitAll } from "../utils/git.js";
import { normalizeProjectDescription } from "./project-description.js";
import { runWatson } from "./watson.js";
import { Type } from "typebox";
import type { RegisteredServiceEntry } from "./session-registered-services.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProjectRuntimeSpec {
  description: string;
}

const ProjectRuntimeSpecSchema = Type.Object({
  description: Type.String(),
});

/** UI port exposed by a running service. */
export interface SessionUiPort {
  scriptName: string;
  envVar: string;
  label?: string;
  path?: string;
}

/** Session.meta snapshot for project dev services (registered via extension). */
export interface SessionServicesMeta {
  /** Agent-registered service definitions + runtime state. */
  entries?: RegisteredServiceEntry[];
  portEnv: Record<string, string>;
  startedAt?: string;
  status: "starting" | "running" | "active" | "stopped" | "idle" | "error" | "unregistered";
  error?: string;
  sleepAt?: number;
  installedAt?: string;
  lastActiveAt?: number;
  uiPorts?: SessionUiPort[];
}

export function buildProjectRuntimeInstructions(project: Pick<Project, "name" | "cwd">): string {
  return [
    "请按顺序完成项目解析和初始化：",
    "1. 确认 git 已安装，且当前目录是 git 仓库；必要时执行 git init，但不要修改远程。",
    "2. 探查 README、包管理清单、CI、格式化/检查配置、现有 Agent 指令和项目结构。",
    "3. 在项目根目录创建或补充 AGENTS.md，达到类似 Claude Code `/init` 的效果：",
    "   - 写清项目用途、主要目录、安装/启动/测试/检查命令、代码约定、运行时注意事项和修改边界。",
    "   - 使用简洁 Markdown，不写密钥，不猜测不存在的命令；新文件尽量不超过 200 行。",
    "   - 如果 AGENTS.md 已存在，必须逐字保留原内容，只能在末尾补充缺失信息。",
    "4. 不要自行 commit 或 push；Supervisor 会在解析成功后统一提交改动。",
    "5. 完成后必须调用工具 submit_result，参数 result 为下方 JSON 对象（任务以此结束）。",
    "结果对象格式：",
    "{",
    '  "description": "中文项目描述，200-600字"',
    "}",
    "",
    "约束：",
    "- 不要 commit 或 push；不要写密钥。",
    "- 项目服务的启动/关闭命令由 Session 内 coding agent 通过 ProjectServiceRegister 工具注册，不在此任务输出。",
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
  const originalAgents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : null;
  const run = await runWatson({
    mode: "agent",
    cwd: options.project.cwd,
    kind: "project-parse",
    resultSchema: ProjectRuntimeSpecSchema,
    prompt: buildProjectRuntimeInstructions(options.project),
    injectSystem:
      "本任务必须创建或补充项目根目录 AGENTS.md，并调用 submit_result 提交 description。",
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

  db.updateProject(projectId, { description: spec.description });
}

export { normalizeProjectDescription };
