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
  path?: string;
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
    "请按顺序完成项目解析和初始化：",
    "1. 确认 git 已安装，且当前目录是 git 仓库；必要时执行 git init，但不要修改远程。",
    "2. 探查 README、包管理清单、CI、格式化/检查配置、现有 Agent 指令和项目结构。",
    "3. 在项目根目录创建或重写 AGENTS.md，达到类似 Claude Code `/init` 的效果：",
    "   - 写清项目用途、主要目录、测试/检查命令、代码约定、运行时注意事项和修改边界。",
    "   - 必须包含固定章节「## 本地开发服务」，便于后续 coding agent 直接读取，无需再扫仓库：",
    "     ```markdown",
    "     ## 本地开发服务",
    "     - 安装: `<install 命令，可空>`",
    "     - 启动: `<长期运行的 start 命令；端口用 ${PORT} / ${API_PORT} 等占位>`",
    "     - 停止: `<闲置关闭命令，可空>`",
    "     - 销毁: `<归档/删除时清理命令，可空>`",
    "     ```",
    "   - 不要在 AGENTS.md 里写入口 port/path；实际监听端口与预览路径由后续 coding agent 启动后自行确认并登记。",
    "   - 使用简洁 Markdown，不写密钥，不猜测不存在的命令；尽量不超过 200 行。",
    "   - 若已有 AGENTS.md：可以按项目现状重构整份内容（合并重复、修正过时说明），但应保留仍有效的约定与边界；「本地开发服务」只保留一节。",
    "4. 不要自行 commit 或 push；Supervisor 会在解析成功后统一提交改动。",
    "5. 完成后必须调用工具 submit_result，参数 result 为下方 JSON 对象（任务以此结束）。",
    "结果对象格式：",
    "{",
    '  "description": "中文项目描述，200-600字"',
    "}",
    "",
    "约束：",
    "- 不要 commit 或 push；不要写密钥。",
    "- 只写安装/启动/停止/销毁命令进「本地开发服务」；不要另写独立脚本文件，除非项目本身已有。",
    "- 不要臆造或填写入口 port/path。",
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
  const run = await runWatson({
    mode: "agent",
    cwd: options.project.cwd,
    kind: "project-parse",
    resultSchema: ProjectRuntimeSpecSchema,
    prompt: buildProjectRuntimeInstructions(options.project),
    injectSystem:
      "本任务必须创建或重写项目根目录 AGENTS.md（含「本地开发服务」四类命令，勿写入口 port/path），并调用 submit_result 提交 description。",
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
