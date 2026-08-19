import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureAgentHome, getAgentHomeDir } from "../agent-paths.js";
import type { SupervisorDb } from "../../db/db.js";
import type { Agent } from "../../types.js";
import type { SessionManager } from "../../core/session/session-manager.js";
import { getGlobalSkillsDirectory } from "../skill-resource.js";
import { loadPromptTemplate } from "../../core/resource/system-prompts.js";
import { loadBuiltinAgentPrompt, loadPackagedAgentPrompt } from "./prompts.js";
import { parseSessionMeta } from "../../core/session/session-fields.js";
import {
  ensureAgentBuiltinExtensionBindings,
  ensureBuiltinExtensionResources,
} from "../../extension/builtin/ensure.js";
import { writeLog } from "../../i18n/logs.js";

export const PACKAGED_AGENT_KINDS = ["coding", "smart-router"] as const;
export type PackagedAgentKind = (typeof PACKAGED_AGENT_KINDS)[number];
export type PackagedAgentPromptKind = "intro" | PackagedAgentKind;
const LEGACY_UTILITY_AGENT_NAMES = ["Shadow", "BTW"] as const;

const PACKAGED_AGENT_LABELS: Record<
  PackagedAgentPromptKind,
  {
    name: string;
    description: string;
    toolsPreset: "readonly" | "coding" | "none";
  }
> = {
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
  "smart-router": {
    name: "Smart Router",
    description: "只读任务路由 Agent，负责将工作派发到长期存在的 Agent Session",
    toolsPreset: "readonly",
  },
};

export function isBuiltinAgent(agent: Pick<Agent, "isBuiltin"> | undefined): boolean {
  return agent?.isBuiltin === true;
}

export function findPackagedAgentId(
  db: SupervisorDb,
  kind: PackagedAgentPromptKind,
): number | undefined {
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

/** Reassign sessions from utility Agents removed by the Watson/BTW redesign, then delete the rows. */
function removeLegacyUtilityAgents(db: SupervisorDb): void {
  const legacyIds = db
    .listAgents()
    .filter(
      (agent) =>
        agent.isBuiltin && LEGACY_UTILITY_AGENT_NAMES.includes(agent.name as "Shadow" | "BTW"),
    )
    .map((agent) => agent.id);
  if (legacyIds.length === 0) return;

  const replacement =
    findPackagedAgentId(db, "coding") ??
    db
      .listAgents()
      .find(
        (agent) =>
          agent.backendType === "native" &&
          !LEGACY_UTILITY_AGENT_NAMES.includes(agent.name as "Shadow" | "BTW"),
      )?.id;
  if (replacement === undefined) return;

  db.db.transaction(() => {
    for (const id of legacyIds) {
      db.db
        .prepare(
          `UPDATE sessions
           SET agent_id = COALESCE(
             CASE WHEN spawn_type = 'btw'
               THEN (SELECT parent.agent_id FROM sessions AS parent WHERE parent.id = sessions.parent_id)
             END,
             ?
           )
           WHERE agent_id = ?`,
        )
        .run(replacement, id);
      db.deleteAgent(id);
    }
  })();
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
    ensureBuiltinExtensionResources(db);
    ensureAgentBuiltinExtensionBindings(db, existing.id);
    return;
  }
  const agent = db.insertAgent({
    name: spec.name,
    description: spec.description,
    avatar: spec.avatar,
    backend_type: spec.kind,
    tools_preset: "coding",
    is_builtin: true,
    external_config: JSON.stringify(externalConfig),
    meta: {},
  });
  ensureBuiltinExtensionResources(db);
  ensureAgentBuiltinExtensionBindings(db, agent.id);
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
  for (const kind of PACKAGED_AGENT_KINDS) {
    const id = ensurePackagedAgent(db, kind);
    if (id === undefined) {
      writeLog("warn", "agent.noProviderPackaged", { kind });
    }
  }
  removeLegacyUtilityAgents(db);
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
  if (!existsSync(skillPath)) {
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
    writeLog("warn", "agent.noProviderAssistant");
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
