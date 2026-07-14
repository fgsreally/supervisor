import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureAgentHome, getAgentHomeDir, writeAgentHomeSystemPrompt } from "./agent-paths.js";
import type { SupervisorDb } from "../db/db.js";
import type { Agent } from "../types.js";
import { getDefaultCwd } from "../config/default-cwd.js";
import type { SessionManager } from "../core/session-manager.js";
import { ensureGlobalResourceDirs } from "../resources/resource-paths.js";
import { loadPromptTemplate } from "../resources/system-prompts.js";

export const PACKAGED_AGENT_KINDS = ["shadow", "intro"] as const;
export type PackagedAgentKind = (typeof PACKAGED_AGENT_KINDS)[number];

export const INTERNAL_AGENT_KINDS = ["shadow"] as const;
export type InternalAgentKind = (typeof INTERNAL_AGENT_KINDS)[number];

const PACKAGED_AGENT_LABELS: Record<
  PackagedAgentKind,
  {
    name: string;
    description: string;
    toolsPreset: "readonly" | "coding";
    userSpawnable: boolean;
  }
> = {
  shadow: {
    name: "Shadow",
    description: "Internal shadow collaborator: memory, security review, parent messaging",
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
  userSpawnable?: boolean;
}

interface LegacyAgentMetaRecord extends AgentMetaRecord {
  packagedKind?: PackagedAgentKind;
  internalKind?: string;
}

export function getPackagedAgentsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, "../../agents");
  if (!existsSync(dir)) {
    throw new Error(`Packaged agents directory not found: ${dir}`);
  }
  return dir;
}

function loadBuiltinAgentPrompt(kind: PackagedAgentKind | "assistant"): string {
  const filePath = join(getPackagedAgentsDir(), kind, "prompt.md");
  if (!existsSync(filePath)) {
    throw new Error(`Missing packaged agent prompt: ${filePath}`);
  }
  return readFileSync(filePath, "utf-8").trim();
}

export function loadPackagedAgentPrompt(kind: PackagedAgentKind): string {
  return loadBuiltinAgentPrompt(kind);
}

/** @deprecated use loadPackagedAgentPrompt */
export const loadInternalAgentPrompt = loadPackagedAgentPrompt;

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
    if (meta.builtin && agent.name === label.name) return agent.id;

    const legacyMeta = meta as LegacyAgentMetaRecord;
    if (legacyMeta.packagedKind === kind) return agent.id;
    if (kind === "shadow" && legacyMeta.internalKind === "shadow") return agent.id;
    if (kind === "intro" && legacyMeta.internalKind === "resource-manager") return agent.id;
  }
  return undefined;
}

/** @deprecated use findPackagedAgentId */
export function findInternalAgentId(db: SupervisorDb, kind: InternalAgentKind): number | undefined {
  return findPackagedAgentId(db, kind);
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

  if (existing !== undefined) {
    const agent = db.getAgent(existing);
    if (agent) {
      const homeDir = agent.homeDir ?? getAgentHomeDir(agent.id);
      ensureAgentHome(agent.id, homeDir);
      writeAgentHomeSystemPrompt(homeDir, loadPackagedAgentPrompt(kind));
      const meta = parseAgentMeta(agent);
      if (
        agent.isInternal !== isInternal ||
        agent.name !== label.name ||
        agent.toolsPreset !== label.toolsPreset ||
        meta.builtin !== true ||
        meta.userSpawnable !== label.userSpawnable
      ) {
        db.updateAgent(existing, {
          name: label.name,
          description: label.description,
          is_internal: isInternal ? 1 : 0,
          meta: {
            builtin: true,
            userSpawnable: label.userSpawnable,
          },
        });
      }
    }
    return existing;
  }

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
      userSpawnable: label.userSpawnable,
    },
  });
  const homeDir = agent.homeDir ?? getAgentHomeDir(agent.id);
  ensureAgentHome(agent.id, homeDir);
  writeAgentHomeSystemPrompt(homeDir, loadPackagedAgentPrompt(kind));
  return agent.id;
}

/** Ensure shipped packaged agents (shadow + intro) exist in the database. */
export function ensurePackagedAgents(db: SupervisorDb): void {
  for (const kind of PACKAGED_AGENT_KINDS) {
    const id = ensurePackagedAgent(db, kind);
    if (id === undefined) {
      console.warn(`[pi-supervisor] No provider configured - skipping packaged agent: ${kind}`);
    }
  }
}

/** @deprecated use ensurePackagedAgents */
export function ensureInternalAgents(db: SupervisorDb): void {
  ensurePackagedAgents(db);
}

export function isShadowChildSessionMeta(meta: Record<string, unknown> | undefined): boolean {
  if (!meta) return false;
  return typeof meta.shadowOf === "number";
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
  return db.list().find((session) => {
    const meta = typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta;
    return session.agentId === agentId && meta?.builtin === true;
  })?.id;
}

function installBuiltinAssistantSkill(db: SupervisorDb, agentId: number): void {
  const skillDir = join(ensureGlobalResourceDirs(), "skills", "supervisor-guide");
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
  if (!agent) {
    agent = db.insertAgent({
      name: BUILTIN_ASSISTANT_NAME,
      description: "Supervisor 内置助手，用于配置和管理资源",
      provider_id: provider.providerId,
      model_id: provider.modelId,
      tools_preset: "coding",
      meta: { builtin: true, userSpawnable: true },
    });
  } else {
    const meta = parseAgentMeta(agent);
    if (meta.builtin !== true || meta.userSpawnable !== true) {
      agent = db.updateAgent(agent.id, {
        meta: { builtin: true, userSpawnable: true },
      });
    }
  }

  const homeDir = agent.homeDir ?? getAgentHomeDir(agent.id);
  ensureAgentHome(agent.id, homeDir);
  writeAgentHomeSystemPrompt(homeDir, BUILTIN_ASSISTANT_PROMPT);
  installBuiltinAssistantSkill(db, agent.id);

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
