import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureAgentHome, getAgentHomeDir } from "../agent-paths.js";
import type { SupervisorDb } from "../../db/db.js";
import type { Agent } from "../../types.js";
import type { SessionManager } from "../../core/session-manager.js";
import { getGlobalSkillsDirectory } from "../skill-resource.js";
import { loadPromptTemplate } from "../system-prompts.js";
import { loadBuiltinAgentPrompt, loadPackagedAgentPrompt } from "./prompts.js";
import { parseSessionMeta } from "../../core/session-fields.js";
import {
  ensureAgentBuiltinExtensionBindings,
  ensureBuiltinExtensionResources,
} from "../../extension/builtin/ensure.js";

export const PACKAGED_AGENT_KINDS = ["shadow", "btw", "intro", "coding"] as const;
export type PackagedAgentKind = (typeof PACKAGED_AGENT_KINDS)[number];
const ACTIVE_PACKAGED_AGENT_KINDS: readonly PackagedAgentKind[] = ["shadow", "btw", "coding"];

const LEGACY_INTRO_PROMPT = `你是 Supervisor 的 Intro 引导助手，面向使用者直接对话。

你的职责：

- 帮助新用户了解 Supervisor 能做什么、如何开始
- 讲解 skills、agents、sessions、扩展、HTTP API 等概念
- 按需查看工作区与 Supervisor 资源（会话、消息、agent 配置），给出清晰说明
- 按用户要求编写、迁移和调试 Supervisor 扩展
- 用简洁、友好的方式教学，避免堆砌术语

原则：

- 引导问题先解释清楚；用户要求实现扩展时，可以直接修改代码并运行验证
- 查看资源时引用具体路径、session id 或资源 URL
- 信息不足时说明还需要什么，不要编造

当被问到「怎么用」「有什么功能」「某个 session 里发生了什么」时，先读事实再回答。扩展开发任务应检查现有扩展 API 和项目约定后再实现。`;

const LEGACY_ASSISTANT_PROMPT = `你是 Pi Supervisor 内置助手，负责帮助用户配置、使用和维护 Supervisor。

你可以帮助用户：

- 理解 Supervisor 的 Session、Agent、Context、扩展和资源绑定模型
- 编写、迁移和调试 Supervisor 扩展
- 安装全局 skill、prompt、extension 和 MCP 配置，并通过数据库绑定到 Agent
- 配置模型 Provider、创建 Agent、管理 Session
- 排查 Supervisor 后端与 Web UI 问题

回答应简洁、可执行，优先给出具体源码路径和操作步骤。需要修改代码时先检查现有实现，不确定时明确说明缺少的信息。`;

const LEGACY_ASSISTANT_SKILL = `# Supervisor 使用指南

## 目录结构

- 全局资源：\`~/.supervisor/global/{skills,extensions,prompts}\`（可用 \`--cwd\` 覆盖整个全局根）
- Agent 目录：\`<home>/agents/{agentId}/\`
- 数据库：\`<home>/supervisor.db\`

Agent 通过数据库 binding 使用全局资源，不在 Agent Home 中创建资源软链接。

## 扩展迁移（coding-agent -> supervisor）

1. 准备包含 \`package.json\` 和入口文件的扩展目录
2. Supervisor 扩展 API 见 \`packages/supervisor/src/extension/\`
3. 使用 \`pi-supervisor extensions install <path>\` 安装到全局 catalog
4. 使用 \`pi-supervisor extensions bind <agent-id> <extension-id>\` 绑定到 Agent

## Skill 安装

1. 将 skill 目录放入 \`<home>/global/skills/\`
2. 在 UI 资源面板或 API \`POST /agents/:id/resources\` 绑定到 Agent
3. 输入框 \`/\` 可补全已关联的 skill 和 prompt

## 常用 API

- \`POST /sessions/:id/prompt\` - 发送消息
- \`POST /sessions/:id/ask-answer\` - 回答 ask 工具问题
- \`GET /resources/global\` - 列出全局资源

## Web UI 组件

见 \`packages/supervisor-web-ui/README.md\` 组件映射表。`;

const PACKAGED_AGENT_LABELS: Record<
  PackagedAgentKind,
  {
    name: string;
    description: string;
    toolsPreset: "readonly" | "coding" | "none";
  }
> = {
  shadow: {
    name: "Shadow",
    description: "Silent shadow observer for session memory and lightweight guidance",
    toolsPreset: "none",
  },
  btw: {
    name: "BTW",
    description:
      "BTW 侧问提示词种子（会话复用父 Session 的 Agent，运行时强制 readonly，不再单独作为会话 Agent）",
    toolsPreset: "readonly",
  },
  intro: {
    name: "Intro",
    description: "Supervisor guide and extension authoring assistant",
    toolsPreset: "coding",
  },
  coding: {
    name: "Coding",
    description: "General-purpose coding agent for project work across sessions/worktrees",
    toolsPreset: "coding",
  },
};

export function isBuiltinAgent(agent: Pick<Agent, "isBuiltin"> | undefined): boolean {
  return agent?.isBuiltin === true;
}

export function findPackagedAgentId(db: SupervisorDb, kind: PackagedAgentKind): number | undefined {
  const label = PACKAGED_AGENT_LABELS[kind];
  for (const agent of db.listAgents()) {
    if (agent.isBuiltin && agent.name === label.name) return agent.id;
  }
  return undefined;
}

function pickProvider(db: SupervisorDb): { modelId: number } | null {
  const providers = db.listProviders().filter((p) => p.isEnabled);
  for (const p of providers) {
    const models = db.listModels().filter((m) => m.providerId === p.id);
    if (models.length > 0) return { modelId: models[0].id };
  }
  return null;
}

function ensurePackagedAgent(db: SupervisorDb, kind: PackagedAgentKind): number | undefined {
  const existing = findPackagedAgentId(db, kind);
  const label = PACKAGED_AGENT_LABELS[kind];
  if (existing !== undefined) {
    const agent = db.getAgent(existing);
    const legacyIntroPrompt = agent?.systemPrompt?.trim() === LEGACY_INTRO_PROMPT;
    if (
      kind === "intro" &&
      (legacyIntroPrompt || agent?.systemPrompt !== loadPackagedAgentPrompt(kind))
    ) {
      db.updateAgent(existing, { system_prompt: loadPackagedAgentPrompt(kind) });
    }
    ensureAgentHome(existing, getAgentHomeDir(existing));
    ensureBuiltinExtensionResources(db);
    ensureAgentBuiltinExtensionBindings(db, existing);
    return existing;
  }

  const providerPick = pickProvider(db);
  if (!providerPick) return undefined;

  const agent = db.insertAgent({
    name: label.name,
    description: label.description,
    model_id: providerPick.modelId,
    system_prompt: loadPackagedAgentPrompt(kind),
    tools_preset: label.toolsPreset,
    is_builtin: true,
    meta: {},
  });
  const homeDir = getAgentHomeDir(agent.id);
  ensureAgentHome(agent.id, homeDir);
  ensureBuiltinExtensionResources(db);
  ensureAgentBuiltinExtensionBindings(db, agent.id);
  return agent.id;
}

function ensureExternalAgent(
  db: SupervisorDb,
  spec: {
    kind: "codex" | "claude" | "kimi" | "cursor" | "mimo";
    name: string;
    description: string;
    command: string;
    args?: string[];
    detectArgs?: string[];
    installCommand?: string;
    avatar: string;
  },
): void {
  const externalConfig = {
    command: spec.command,
    ...(spec.args ? { args: spec.args } : {}),
    detectArgs: spec.detectArgs ?? ["--version"],
    ...(spec.installCommand ? { installCommand: spec.installCommand } : {}),
  };
  const existing = db.listAgents().find((agent) => agent.backendType === spec.kind);
  if (existing) {
    // Upgrade stale Cursor packaging to the bundled official avatar.
    if (
      spec.kind === "cursor" &&
      (!existing.avatar ||
        existing.avatar === "/icons/cursor.svg" ||
        existing.avatar.includes("avatars.githubusercontent.com/u/126759922"))
    ) {
      db.updateAgent(existing.id, { avatar: spec.avatar });
    }
    // Cursor CLI 官方二进制名为 cursor-agent；旧配置误写为 agent。
    if (spec.kind === "cursor") {
      const config = existing.externalConfig;
      if (config?.command === "agent") {
        db.updateAgent(existing.id, {
          external_config: JSON.stringify({
            ...config,
            command: spec.command,
            args: config.args?.length ? config.args : (spec.args ?? []),
            detectArgs: config.detectArgs ?? externalConfig.detectArgs,
            installCommand: config.installCommand ?? externalConfig.installCommand,
          }),
        });
      }
    }
    // Backfill detect/install fields for agents seeded before this feature.
    const config = existing.externalConfig;
    if (config && (!config.detectArgs?.length || !config.installCommand)) {
      db.updateAgent(existing.id, {
        external_config: JSON.stringify({
          ...config,
          detectArgs: config.detectArgs?.length ? config.detectArgs : externalConfig.detectArgs,
          installCommand: config.installCommand ?? externalConfig.installCommand,
        }),
      });
    }
    return;
  }
  db.insertAgent({
    name: spec.name,
    description: spec.description,
    avatar: spec.avatar,
    backend_type: spec.kind,
    tools_preset: "coding",
    is_builtin: true,
    external_config: JSON.stringify(externalConfig),
    meta: {},
  });
}

/** Ensure shipped native and external agents exist in the database. */
export function ensurePackagedAgents(db: SupervisorDb): void {
  ensureExternalAgent(db, {
    kind: "codex",
    name: "Codex",
    description: "OpenAI Codex CLI connected through app-server",
    command: "codex",
    detectArgs: ["--version"],
    installCommand: "npm install -g @openai/codex",
    avatar: "/icons/openai.svg",
  });
  ensureExternalAgent(db, {
    kind: "claude",
    name: "Claude Code",
    description: "Claude Code CLI connected through stream-json",
    command: "claude",
    detectArgs: ["--version"],
    installCommand: "npm install -g @anthropic-ai/claude-code",
    avatar: "/icons/anthropic.svg",
  });
  ensureExternalAgent(db, {
    kind: "kimi",
    name: "Kimi Code",
    description: "Kimi Code CLI connected through Agent Client Protocol",
    command: "kimi",
    args: ["acp"],
    detectArgs: ["--version"],
    installCommand: "npm install -g @moonshot-ai/kimi-code",
    avatar: "https://avatars.githubusercontent.com/u/129152888?s=48&v=4",
  });
  ensureExternalAgent(db, {
    kind: "cursor",
    name: "Cursor",
    description: "Cursor CLI connected through Agent Client Protocol",
    command: "cursor-agent",
    args: ["acp"],
    detectArgs: ["--version"],
    installCommand:
      process.platform === "win32"
        ? "powershell -ep Bypass -c \"irm 'https://cursor.com/install?win32=true' | iex\""
        : "curl https://cursor.com/install -fsS | bash",
    avatar: "/icons/cursor.png",
  });
  ensureExternalAgent(db, {
    kind: "mimo",
    name: "MiMo Code",
    description: "MiMoCode CLI connected through Agent Client Protocol",
    command: "mimo",
    args: ["acp"],
    detectArgs: ["--version"],
    installCommand:
      process.platform === "win32"
        ? 'powershell -ep Bypass -c "irm https://mimo.xiaomi.com/install.ps1 | iex"'
        : "curl -fsSL https://mimo.xiaomi.com/install | bash",
    avatar: "/icons/mimo.png",
  });
  for (const kind of ACTIVE_PACKAGED_AGENT_KINDS) {
    const id = ensurePackagedAgent(db, kind);
    if (id === undefined) {
      console.warn(`[pi-supervisor] No provider configured - skipping packaged agent: ${kind}`);
    }
  }
}

const BUILTIN_ASSISTANT_NAME = "Pi 助手";
const BUILTIN_ASSISTANT_PROMPT = loadBuiltinAgentPrompt("assistant");
const BUILTIN_ASSISTANT_SKILL = loadPromptTemplate("builtin-assistant-skill");

function findBuiltinAssistantId(db: SupervisorDb): number | undefined {
  return db.listAgents().find((agent) => agent.name === BUILTIN_ASSISTANT_NAME && agent.isBuiltin)
    ?.id;
}

function findBuiltinAssistantSessionId(db: SupervisorDb, agentId: number): number | undefined {
  const assistantAgentIds = new Set(
    db
      .listAgents()
      .filter((agent) => agent.name === BUILTIN_ASSISTANT_NAME)
      .map((agent) => agent.id),
  );
  const sessions = db
    .list()
    .filter(
      (session) =>
        (session.is_builtin === 1 || parseSessionMeta(session.meta).builtin === true) &&
        (session.agent_id === agentId ||
          (session.agent_id !== null && assistantAgentIds.has(session.agent_id))),
    )
    .sort((left, right) => {
      const leftUsesCurrentAgent = left.agent_id === agentId ? 1 : 0;
      const rightUsesCurrentAgent = right.agent_id === agentId ? 1 : 0;
      return rightUsesCurrentAgent - leftUsesCurrentAgent || left.id - right.id;
    });
  const primary = sessions[0];
  for (const duplicate of sessions.slice(1)) db.delete(duplicate.id);
  return primary?.id;
}

/** Remove legacy duplicate assistant sessions before SessionManager caches persisted rows. */
export function dedupeBuiltinAssistantSessions(db: SupervisorDb): void {
  const agentId = findBuiltinAssistantId(db);
  if (agentId === undefined) return;

  const legacyIntro = db
    .listAgents()
    .find((agent) => agent.isBuiltin && agent.name === PACKAGED_AGENT_LABELS.intro.name);
  if (legacyIntro) {
    db.db.transaction(() => {
      db.db
        .prepare(
          `INSERT OR IGNORE INTO agent_resources
             (agent_id, resource_id, enabled, priority, created_at)
           SELECT ?, resource_id, enabled, priority, created_at
           FROM agent_resources WHERE agent_id = ?`,
        )
        .run(agentId, legacyIntro.id);
      db.db
        .prepare("UPDATE sessions SET agent_id = ? WHERE agent_id = ?")
        .run(agentId, legacyIntro.id);
      db.deleteAgent(legacyIntro.id);
    })();
  }

  findBuiltinAssistantSessionId(db, agentId);
}

function installBuiltinAssistantSkill(db: SupervisorDb, agentId: number): void {
  const skillDir = join(getGlobalSkillsDirectory(), "supervisor-guide");
  mkdirSync(skillDir, { recursive: true });
  const skillPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillPath) || readFileSync(skillPath, "utf8").trim() === LEGACY_ASSISTANT_SKILL) {
    writeFileSync(skillPath, BUILTIN_ASSISTANT_SKILL, "utf8");
  }
  const resource = db.upsertResource({
    kind: "skill",
    slug: "supervisor-guide",
    name: "supervisor-guide",
    source_path: skillDir,
  });
  db.bindAgentResource(agentId, resource.id);
}

/** Ensure the built-in assistant and its pinned session exist. */
export function ensureBuiltinAssistant(db: SupervisorDb, manager: SessionManager): void {
  const provider = pickProvider(db);
  if (!provider) {
    console.warn("[pi-supervisor] No provider configured - skipping built-in Pi assistant setup");
    return;
  }

  const existingId = findBuiltinAssistantId(db);
  let agent = existingId === undefined ? undefined : db.getAgent(existingId);
  if (!agent) {
    agent = db.insertAgent({
      name: BUILTIN_ASSISTANT_NAME,
      description: "Supervisor 内置助手，用于配置和管理资源",
      model_id: provider.modelId,
      system_prompt: BUILTIN_ASSISTANT_PROMPT,
      tools_preset: "coding",
      is_builtin: true,
      meta: {},
    });
  } else if (
    agent.systemPrompt?.trim() === LEGACY_ASSISTANT_PROMPT ||
    agent.systemPrompt !== BUILTIN_ASSISTANT_PROMPT
  ) {
    agent = db.updateAgent(agent.id, { system_prompt: BUILTIN_ASSISTANT_PROMPT });
  }

  const homeDir = getAgentHomeDir(agent.id);
  ensureAgentHome(agent.id, homeDir);
  ensureBuiltinExtensionResources(db);
  ensureAgentBuiltinExtensionBindings(db, agent.id);
  installBuiltinAssistantSkill(db, agent.id);

  let sessionId = findBuiltinAssistantSessionId(db, agent.id);
  const assistantCwd = getAgentHomeDir(agent.id);
  if (sessionId === undefined) {
    sessionId = manager.create({
      agentId: agent.id,
      cwd: assistantCwd,
      title: BUILTIN_ASSISTANT_NAME,
      pinned: true,
      isBuiltin: true,
      projectId: null,
    }).id;
  }

  const session = db.get(sessionId);
  if (!session) return;
  db.updateCwd(sessionId, assistantCwd);
  db.updateSessionFields(sessionId, {
    title: BUILTIN_ASSISTANT_NAME,
    pinned: true,
    isBuiltin: true,
    projectId: null,
  });
}
