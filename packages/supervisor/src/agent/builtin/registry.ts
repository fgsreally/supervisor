import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureAgentHome, getAgentHomeDir, writeAgentHomeSystemPrompt } from "../agent-paths.js";
import type { SupervisorDb } from "../../db/db.js";
import type { Agent } from "../../types.js";
import { getDefaultCwd } from "../../config/default-cwd.js";
import type { SessionManager } from "../../core/session-manager.js";
import { getGlobalSkillsDirectory } from "../skill-resource.js";
import { loadPromptTemplate } from "../system-prompts.js";
import { loadBuiltinAgentPrompt, loadPackagedAgentPrompt } from "./prompts.js";

export const PACKAGED_AGENT_KINDS = ["shadow", "btw", "intro"] as const;
export type PackagedAgentKind = (typeof PACKAGED_AGENT_KINDS)[number];

const PACKAGED_AGENT_LABELS: Record<
  PackagedAgentKind,
  {
    name: string;
    description: string;
    toolsPreset: "readonly" | "coding" | "none";
    userSpawnable: boolean;
  }
> = {
  shadow: {
    name: "Shadow",
    description: "Silent shadow observer for session memory and lightweight guidance",
    toolsPreset: "none",
    userSpawnable: false,
  },
  btw: {
    name: "BTW",
    description: "Read-only side-question agent that follows the current parent context",
    toolsPreset: "readonly",
    userSpawnable: false,
  },
  intro: {
    name: "Intro",
    description: "Supervisor guide and extension authoring assistant",
    toolsPreset: "coding",
    userSpawnable: true,
  },
};

export interface AgentMetaRecord {
  builtin?: boolean;
  packagedKind?: PackagedAgentKind;
  externalKind?: "codex" | "claude" | "kimi";
  userSpawnable?: boolean;
  external?: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    permissionPolicy?: "allow_once" | "reject_once";
  };
}

export function parseAgentMeta(agent: Pick<Agent, "meta"> | undefined): AgentMetaRecord {
  if (!agent?.meta) return {};
  return typeof agent.meta === "string" ? JSON.parse(agent.meta) : (agent.meta as AgentMetaRecord);
}

export function isAgentUserSpawnable(
  agent: Pick<Agent, "isInternal" | "meta"> | undefined,
): boolean {
  if (!agent) return false;
  const meta = parseAgentMeta(agent);
  return meta.userSpawnable ?? !agent.isInternal;
}

export function isBuiltinAgent(agent: Pick<Agent, "meta"> | undefined): boolean {
  return parseAgentMeta(agent).builtin === true;
}

export function assertAgentUserSpawnable(
  agent: Pick<Agent, "isInternal" | "meta"> | undefined,
  agentId?: number,
): void {
  if (!isAgentUserSpawnable(agent)) {
    const label = agentId !== undefined ? `Agent ${agentId}` : "This agent";
    throw new Error(`${label} is internal and cannot be used to create user sessions`);
  }
}

export function findPackagedAgentId(db: SupervisorDb, kind: PackagedAgentKind): number | undefined {
  const label = PACKAGED_AGENT_LABELS[kind];
  for (const agent of db.listAgents()) {
    const meta = parseAgentMeta(agent);
    if (meta.packagedKind === kind) return agent.id;
    if (meta.builtin && agent.name === label.name) return agent.id;
  }
  return undefined;
}

function pickProvider(db: SupervisorDb): { providerId: number; modelId: string } | null {
  const providers = db.listProviders().filter((p) => p.isEnabled);
  for (const p of providers) {
    const models = db.listModels().filter((m) => m.providerId === p.id);
    if (models.length > 0) return { providerId: p.id, modelId: models[0].modelId };
  }
  return null;
}

function ensurePackagedAgent(db: SupervisorDb, kind: PackagedAgentKind): number | undefined {
  const existing = findPackagedAgentId(db, kind);
  const label = PACKAGED_AGENT_LABELS[kind];
  const isInternal = !label.userSpawnable;

  if (existing !== undefined) return existing;

  const providerPick = pickProvider(db);
  if (!providerPick) return undefined;

  const agent = db.insertAgent({
    name: label.name,
    description: label.description,
    provider_id: providerPick.providerId,
    model_id: providerPick.modelId,
    tools_preset: label.toolsPreset,
    is_internal: isInternal,
    meta: {
      builtin: true,
      packagedKind: kind,
      userSpawnable: label.userSpawnable,
    },
  });
  const homeDir = getAgentHomeDir(agent.id);
  ensureAgentHome(agent.id, homeDir);
  writeAgentHomeSystemPrompt(homeDir, loadPackagedAgentPrompt(kind));
  return agent.id;
}

function ensureExternalAgent(
  db: SupervisorDb,
  spec: {
    kind: "codex" | "claude" | "kimi";
    name: string;
    description: string;
    command: string;
    args?: string[];
    icon: string;
  },
): void {
  const existing = db
    .listAgents()
    .find((agent) => parseAgentMeta(agent).externalKind === spec.kind);
  if (existing) {
    const meta = { ...existing.meta };
    const legacy = meta.external as { command?: unknown; args?: unknown } | undefined;
    if (legacy && typeof meta.command !== "string") meta.command = legacy.command;
    if (legacy && !Array.isArray(meta.args)) meta.args = legacy.args;
    delete meta.external;
    db.updateAgent(existing.id, { meta });
    return;
  }
  db.insertAgent({
    name: spec.name,
    description: spec.description,
    icon: spec.icon,
    provider_id: null,
    backend_type: spec.kind,
    tools_preset: "coding",
    meta: {
      builtin: true,
      externalKind: spec.kind,
      userSpawnable: true,
      command: spec.command,
      args: spec.args,
    },
  });
}

/** Ensure shipped native and external agents exist in the database. */
export function ensurePackagedAgents(db: SupervisorDb): void {
  ensureExternalAgent(db, {
    kind: "codex",
    name: "Codex",
    description: "OpenAI Codex CLI connected through app-server",
    command: "codex",
    icon: "/icons/openai.svg",
  });
  ensureExternalAgent(db, {
    kind: "claude",
    name: "Claude Code",
    description: "Claude Code CLI connected through stream-json",
    command: "claude",
    icon: "/icons/anthropic.svg",
  });
  ensureExternalAgent(db, {
    kind: "kimi",
    name: "Kimi Code",
    description: "Kimi Code CLI connected through Agent Client Protocol",
    command: "kimi",
    args: ["acp"],
    icon: "https://avatars.githubusercontent.com/u/129152888?s=48&v=4",
  });
  for (const kind of PACKAGED_AGENT_KINDS) {
    const id = ensurePackagedAgent(db, kind);
    if (id === undefined) {
      console.warn(`[pi-supervisor] No provider configured - skipping packaged agent: ${kind}`);
    } else if (kind === "btw") {
      for (const session of db.list()) {
        if (session.parentId !== null || db.listMemberAgentsByTag(session.id, "btw").length > 0)
          continue;
        db.upsertMember({
          session_id: session.id,
          agent_id: id,
          role: "assistant",
          tags: ["btw"],
        });
      }
    }
  }
}

const BUILTIN_ASSISTANT_NAME = "Pi 助手";
const BUILTIN_ASSISTANT_PROMPT = loadBuiltinAgentPrompt("assistant");
const BUILTIN_ASSISTANT_SKILL = loadPromptTemplate("builtin-assistant-skill");

function findBuiltinAssistantId(db: SupervisorDb): number | undefined {
  return db
    .listAgents()
    .find(
      (agent) => agent.name === BUILTIN_ASSISTANT_NAME && parseAgentMeta(agent).builtin === true,
    )?.id;
}

function findBuiltinAssistantSessionId(db: SupervisorDb, agentId: number): number | undefined {
  const sessions = db
    .list()
    .filter((session) => {
      const meta = typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta;
      return session.agent_id === agentId && meta?.builtin === true;
    })
    .sort((left, right) => left.id - right.id);
  const primary = sessions[0];
  for (const duplicate of sessions.slice(1)) db.delete(duplicate.id);
  return primary?.id;
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
    console.warn("[pi-supervisor] No provider configured - skipping built-in Pi assistant setup");
    return;
  }

  const existingId = findBuiltinAssistantId(db);
  let agent = existingId === undefined ? undefined : db.getAgent(existingId);
  let created = false;
  if (!agent) {
    agent = db.insertAgent({
      name: BUILTIN_ASSISTANT_NAME,
      description: "Supervisor 内置助手，用于配置和管理资源",
      provider_id: provider.providerId,
      model_id: provider.modelId,
      tools_preset: "coding",
      meta: { builtin: true, userSpawnable: true },
    });
    created = true;
  }

  if (created) {
    const homeDir = getAgentHomeDir(agent.id);
    ensureAgentHome(agent.id, homeDir);
    writeAgentHomeSystemPrompt(homeDir, BUILTIN_ASSISTANT_PROMPT);
    installBuiltinAssistantSkill(db, agent.id);
  }

  let sessionId = findBuiltinAssistantSessionId(db, agent.id);
  if (sessionId === undefined) {
    sessionId = manager.create({
      agentId: agent.id,
      cwd: getDefaultCwd(),
      meta: {
        name: BUILTIN_ASSISTANT_NAME,
        pinned: true,
        builtin: true,
        description: "Supervisor 内置助手会话",
      },
    }).id;
  }

  const session = db.get(sessionId);
  if (!session) return;
  const meta = typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta;
  db.updateMeta(sessionId, {
    ...meta,
    name: BUILTIN_ASSISTANT_NAME,
    pinned: true,
    builtin: true,
  });
}
