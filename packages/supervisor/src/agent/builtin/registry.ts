import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureAgentHome, getAgentHomeDir } from "../agent-paths.js";
import type { SupervisorDb } from "../../db/db.js";
import type { Agent } from "../../types.js";
import { getDefaultCwd } from "../../config/default-cwd.js";
import type { SessionManager } from "../../core/session-manager.js";
import { getGlobalSkillsDirectory } from "../skill-resource.js";
import { loadPromptTemplate } from "../system-prompts.js";
import { loadBuiltinAgentPrompt, loadPackagedAgentPrompt } from "./prompts.js";
import {
  ensureAgentBuiltinExtensionBindings,
  ensureBuiltinExtensionResources,
} from "../../extension/builtin/ensure.js";

export const PACKAGED_AGENT_KINDS = ["shadow", "btw", "intro", "coding"] as const;
export type PackagedAgentKind = (typeof PACKAGED_AGENT_KINDS)[number];

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
  if (existing !== undefined) return existing;

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
    kind: "codex" | "claude" | "kimi";
    name: string;
    description: string;
    command: string;
    args?: string[];
    avatar: string;
  },
): void {
  const existing = db
    .listAgents()
    .find((agent) => agent.backendType === spec.kind);
  if (existing) {
    return;
  }
  db.insertAgent({
    name: spec.name,
    description: spec.description,
    avatar: spec.avatar,
    backend_type: spec.kind,
    tools_preset: "coding",
    is_builtin: true,
    external_config: JSON.stringify({ command: spec.command, ...(spec.args ? { args: spec.args } : {}) }),
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
    avatar: "/icons/openai.svg",
  });
  ensureExternalAgent(db, {
    kind: "claude",
    name: "Claude Code",
    description: "Claude Code CLI connected through stream-json",
    command: "claude",
    avatar: "/icons/anthropic.svg",
  });
  ensureExternalAgent(db, {
    kind: "kimi",
    name: "Kimi Code",
    description: "Kimi Code CLI connected through Agent Client Protocol",
    command: "kimi",
    args: ["acp"],
    avatar: "https://avatars.githubusercontent.com/u/129152888?s=48&v=4",
  });
  for (const kind of PACKAGED_AGENT_KINDS) {
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
  return db
    .listAgents()
    .find(
      (agent) => agent.name === BUILTIN_ASSISTANT_NAME && agent.isBuiltin,
    )?.id;
}

function findBuiltinAssistantSessionId(db: SupervisorDb, agentId: number): number | undefined {
  const sessions = db
    .list()
    .filter((session) => session.agent_id === agentId && session.is_builtin === 1)
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
      model_id: provider.modelId,
      system_prompt: BUILTIN_ASSISTANT_PROMPT,
      tools_preset: "coding",
      is_builtin: true,
      meta: {},
    });
    created = true;
  }

  if (created) {
    const homeDir = getAgentHomeDir(agent.id);
    ensureAgentHome(agent.id, homeDir);
    installBuiltinAssistantSkill(db, agent.id);
    ensureBuiltinExtensionResources(db);
    ensureAgentBuiltinExtensionBindings(db, agent.id);
  }

  let sessionId = findBuiltinAssistantSessionId(db, agent.id);
  if (sessionId === undefined) {
    sessionId = manager.create({
      agentId: agent.id,
      cwd: getDefaultCwd(),
      title: BUILTIN_ASSISTANT_NAME,
      pinned: true,
      isBuiltin: true,
    }).id;
  }

  const session = db.get(sessionId);
  if (!session) return;
  db.updateSessionFields(sessionId, {
    title: BUILTIN_ASSISTANT_NAME,
    pinned: true,
    isBuiltin: true,
  });
}
