import { readFileSync } from "node:fs";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Agent } from "../types.js";
import type { SourceInfo } from "../utils/source-info.js";
import type { SupervisorDb } from "../db/db.js";
import { loadAgentSessionResources } from "./agent-resources.js";
import { expandPromptTemplate, type PromptTemplate } from "./prompt-templates.js";
import { formatSkillsForPrompt, type Skill } from "./skills.js";
import { McpClientManager } from "../mcp/mcp-client-manager.js";
import { loadMcpConfigFile } from "../mcp/mcp-config-loader.js";
import type { McpServerConfigType } from "../mcp/mcp-types.js";

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
  /** 当前会话 ID，用于隔离 MCP 连接。 */
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

/**
 * 与单个运行中 Agent 绑定的非扩展资源管理器。
 * Skill、Prompt Template、SYSTEM.md 和 MCP 的加载、使用及清理都由它统一负责。
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

  /** 已加载的 Prompt Template 列表。 */
  private loadedPromptTemplates: PromptTemplate[] = [];

  /** 从 Agent 主目录加载的 SYSTEM.md 内容。 */
  private loadedSystemMd = "";

  /** 当前 Agent 独占的 MCP 客户端管理器。 */
  private mcpManager: McpClientManager | null = null;

  /** 记录资源是否已完成加载，避免重复建立 MCP 连接。 */
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

  /** 加载 Skill、Prompt Template、SYSTEM.md，并连接该 Agent 绑定的 MCP 服务。 */
  async load(): Promise<void> {
    if (this.loaded) return;

    const resources = loadAgentSessionResources(this.db, this.agent, this.cwd);
    this.loadedSkills = resources.skills;
    this.loadedPromptTemplates = resources.promptTemplates;
    this.loadedSystemMd = resources.systemMd;

    const mcpConfigs = this.loadBoundMcpConfigs();
    this.mcpManager = new McpClientManager(mcpConfigs);
    await this.mcpManager.connectAll();
    this.loaded = true;
  }

  /** 返回用于拼入系统提示词的全部 Skill 文本。 */
  getSkillsPrompt(): string {
    return formatSkillsForPrompt(this.loadedSkills);
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

  /** 返回当前 Agent 已连接 MCP 服务提供的工具。 */
  getMcpTools(): AgentTool[] {
    return this.mcpManager?.getTools() ?? [];
  }

  /** 断开 MCP 服务并清除当前 Agent 已加载的全部非扩展资源。 */
  async clear(): Promise<void> {
    await this.mcpManager?.disconnectAll();
    this.mcpManager = null;
    this.loadedSkills = [];
    this.loadedPromptTemplates = [];
    this.loadedSystemMd = "";
    this.loaded = false;
  }

  /** 从数据库绑定的 MCP JSON 文件合并服务配置。 */
  private loadBoundMcpConfigs(): Record<string, McpServerConfigType> | undefined {
    const bindings = this.db.listAgentResources(this.agentId, "mcp");
    if (bindings.length === 0) return undefined;

    const servers: Record<string, McpServerConfigType> = {};
    for (const binding of bindings) {
      const sourcePath = binding.resource?.sourcePath;
      if (!sourcePath) continue;
      const config = loadMcpConfigFile(sourcePath);
      if (!config) continue;
      for (const [name, server] of Object.entries(config.servers)) {
        if (!server.disabled) servers[name] = server;
      }
    }
    return servers;
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
      const rawContent = readFileSync(skill.filePath, "utf-8");
      const body = this.stripFrontmatter(rawContent);
      const block = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
      return args ? `${block}\n\n${args}` : block;
    } catch {
      return message;
    }
  }

  /** 去掉 Markdown 文件开头的 YAML frontmatter。 */
  private stripFrontmatter(content: string): string {
    if (!content.startsWith("---")) return content;
    const end = content.indexOf("\n---", 3);
    return end === -1 ? content : content.slice(end + 4).trim();
  }
}
