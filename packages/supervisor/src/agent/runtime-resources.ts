import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { Agent } from "../types.js";
import type { SourceInfo } from "../utils/source-info.js";
import type { SupervisorDb } from "../db/db.js";
import { loadAgentSessionResources } from "./resource-resolver.js";
import { expandPromptTemplate, type PromptTemplate } from "./prompt-templates.js";
import { formatSkillsForPrompt, type Skill } from "./skills.js";
import { stripFrontmatter } from "../utils/frontmatter.js";

/** Resource 可提供的动态斜杠命令来源。 */
export type AgentResourceCommandSource = "prompt" | "skill";

/** Resource 对外返回的动态斜杠命令信息。 */
export interface AgentResourceCommandInfo {
  /** 用户输入时使用的命令名称。 */
  name: string;
  /** 展示给用户的命令说明。 */
  description?: string;
  /** 命令来自 Skill 还是 Prompt Template。 */
  source: AgentResourceCommandSource;
  /** 命令源文件及加载层级信息。 */
  sourceInfo: SourceInfo;
}

/** 创建单个 Agent 资源管理器所需的上下文。 */
export interface AgentResourceOptions {
  /** 当前会话 ID。 */
  sessionId: number;
  /** 当前会话实际绑定的 Agent ID。 */
  agentId: number;
  /** 当前 Agent 的工作目录。 */
  cwd: string;
  /** Supervisor 数据库，用于读取 Agent 的资源绑定。 */
  db: SupervisorDb;
  /** 当前 Agent 的数据库记录；无记录时使用默认资源。 */
  agent?: Agent;
}

export interface SkillToolInput {
  name: string;
  arguments?: string;
  path?: string;
  line_start?: number;
  line_end?: number;
}

export interface SkillToolResult {
  text: string;
  details: {
    name: string;
    operation: "activate" | "list" | "read";
    path?: string;
    baseDir: string;
  };
}

/**
 * 与单个运行中 Agent 绑定的非扩展资源管理器。
 * Skill、Prompt Template 和 SYSTEM.md 的加载、使用及清理都由它统一负责。
 */
export class AgentResource {
  /** 当前会话 ID。 */
  readonly sessionId: number;

  /** 当前资源所属的 Agent ID。 */
  readonly agentId: number;

  /** 当前 Agent 的工作目录。 */
  readonly cwd: string;

  /** Supervisor 数据库引用。 */
  private readonly db: SupervisorDb;

  /** 当前 Agent 的数据库记录。 */
  private readonly agent?: Agent;

  /** 已加载的 Skill 列表。 */
  private loadedSkills: Skill[] = [];

  /** 用户通过斜杠命令显式激活的 Skill。 */
  private userActivatedSkills = new Set<string>();

  /** 已加载的 Prompt Template 列表。 */
  private loadedPromptTemplates: PromptTemplate[] = [];

  /** 从 Agent 主目录加载的 SYSTEM.md 内容。 */
  private loadedSystemMd = "";

  /** 记录资源是否已完成加载，避免重复读取。 */
  private loaded = false;

  /** 保存 Agent 上下文，但不立即执行文件读取或网络连接。 */
  constructor(options: AgentResourceOptions) {
    this.sessionId = options.sessionId;
    this.agentId = options.agentId;
    this.cwd = options.cwd;
    this.db = options.db;
    this.agent = options.agent;
  }

  /** 返回当前 Agent 已加载的 Skill；调用方不能修改内部数组。 */
  get skills(): readonly Skill[] {
    return this.loadedSkills;
  }

  /** 返回当前 Agent 已加载的 Prompt Template；调用方不能修改内部数组。 */
  get promptTemplates(): readonly PromptTemplate[] {
    return this.loadedPromptTemplates;
  }

  /** 返回当前 Agent 的 SYSTEM.md 内容。 */
  get systemMd(): string {
    return this.loadedSystemMd;
  }

  /** 加载 Skill、Prompt Template 和 SYSTEM.md。 */
  load(): void {
    if (this.loaded) return;

    const resources = loadAgentSessionResources(this.db, this.agent, this.cwd);
    this.loadedSkills = resources.skills;
    this.loadedPromptTemplates = resources.promptTemplates;
    this.loadedSystemMd = resources.systemMd;

    this.loaded = true;
  }

  /** 返回用于拼入系统提示词的全部 Skill 文本。 */
  getSkillsPrompt(): string {
    return formatSkillsForPrompt(this.loadedSkills);
  }

  /** 当前会话是否存在 Skill 资源。 */
  hasSkills(): boolean {
    return this.loadedSkills.length > 0;
  }

  /** 执行内置 skill 扩展的资源操作。 */
  executeSkillTool(input: SkillToolInput): SkillToolResult {
    const accessibleSkills = this.loadedSkills.filter(
      (skill) => !skill.disableModelInvocation || this.userActivatedSkills.has(skill.name),
    );
    const skill = accessibleSkills.find((item) => item.name === input.name);
    if (!skill) {
      const available = accessibleSkills.map((item) => item.name).join(", ");
      throw new Error(`Skill "${input.name}" not found. Available skills: ${available || "none"}`);
    }

    if (!input.path) {
      return {
        text: this.renderSkill(skill, input.arguments ?? ""),
        details: { name: skill.name, operation: "activate", baseDir: skill.baseDir },
      };
    }

    const target = this.resolveSkillResourcePath(skill, input.path);
    const stats = statSync(target);
    if (stats.isDirectory()) {
      const entries = readdirSync(target, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => `${entry.isDirectory() ? "directory" : "file"}\t${entry.name}`);
      return {
        text: entries.length > 0 ? entries.join("\n") : "(empty directory)",
        details: {
          name: skill.name,
          operation: "list",
          path: input.path,
          baseDir: skill.baseDir,
        },
      };
    }
    if (!stats.isFile()) throw new Error(`Skill resource is not a regular file: ${input.path}`);

    const content = readFileSync(target, "utf-8");
    if (content.includes("\0")) throw new Error(`Skill resource is not a text file: ${input.path}`);
    const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const start = Math.max(1, Math.floor(input.line_start ?? 1));
    const end = Math.min(lines.length, Math.floor(input.line_end ?? start + 499));
    if (end < start) throw new Error("line_end must be greater than or equal to line_start");
    const numbered = lines
      .slice(start - 1, end)
      .map((line, index) => `${start + index}: ${line}`)
      .join("\n");
    const suffix = end < lines.length ? `\n\n[${lines.length - end} more lines]` : "";
    return {
      text: numbered + suffix,
      details: {
        name: skill.name,
        operation: "read",
        path: input.path,
        baseDir: skill.baseDir,
      },
    };
  }

  /** 展开用户输入中的 /skill:name 或 Prompt Template 命令。 */
  expandPrompt(message: string): string {
    const skillExpanded = this.expandSkillCommand(message);
    return expandPromptTemplate(skillExpanded, this.loadedPromptTemplates);
  }

  /** 返回 Skill 和 Prompt Template 对应的动态斜杠命令。 */
  getSlashCommands(): AgentResourceCommandInfo[] {
    const skillCommands: AgentResourceCommandInfo[] = this.loadedSkills.map((skill) => ({
      name: `skill:${skill.name}`,
      description: skill.description,
      source: "skill",
      sourceInfo: skill.sourceInfo,
    }));
    const templateCommands: AgentResourceCommandInfo[] = this.loadedPromptTemplates.map(
      (template) => ({
        name: template.name,
        description: template.description,
        source: "prompt",
        sourceInfo: template.sourceInfo,
      }),
    );
    return [...skillCommands, ...templateCommands];
  }

  /** 清除当前 Agent 已加载的非扩展资源。 */
  clear(): void {
    this.loadedSkills = [];
    this.userActivatedSkills.clear();
    this.loadedPromptTemplates = [];
    this.loadedSystemMd = "";
    this.loaded = false;
  }

  /** 将 /skill:name 命令替换成包含 Skill 正文和参数的模型输入。 */
  private expandSkillCommand(message: string): string {
    if (!message.startsWith("/skill:")) return message;

    const spaceIndex = message.indexOf(" ");
    const skillName = spaceIndex === -1 ? message.slice(7) : message.slice(7, spaceIndex);
    const args = spaceIndex === -1 ? "" : message.slice(spaceIndex + 1);
    const skill = this.loadedSkills.find((item) => item.name === skillName);
    if (!skill) return message;

    try {
      this.userActivatedSkills.add(skill.name);
      return this.renderSkill(skill, args);
    } catch {
      return message;
    }
  }

  /** 由宿主读取并包装 Skill，模型无需知道 SKILL.md 的磁盘路径。 */
  private renderSkill(skill: Skill, args: string): string {
    const body = stripFrontmatter(readFileSync(skill.filePath, "utf-8"));
    const attributes = args ? ` arguments="${escapeXml(args)}"` : "";
    const argumentsBlock = args ? `\n\nARGUMENTS: ${args}` : "";
    return `<skill_content name="${escapeXml(skill.name)}"${attributes}>\n${body}${argumentsBlock}\n\nThe skill entry instructions are now active. Bundled resources have not been loaded. Use the skill tool with name and a relative path to list or read them when needed.\n</skill_content>`;
  }

  private resolveSkillResourcePath(skill: Skill, resourcePath: string): string {
    if (isAbsolute(resourcePath)) throw new Error("Skill resource path must be relative");
    const base = realpathSync(skill.baseDir);
    const target = realpathSync(resolve(base, resourcePath));
    const relativePath = relative(base, target);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error("Skill resource path escapes the skill directory");
    }
    return target;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
