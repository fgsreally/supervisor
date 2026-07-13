import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	ensureAgentHome,
	getAgentHomeDir,
	writeAgentHomeSystemPrompt,
} from "./agent-paths.js";
import type { SupervisorDb } from "../db/db.js";
import type { Agent } from "../types.js";

export const PACKAGED_AGENT_KINDS = ["shadow", "intro"] as const;
export type PackagedAgentKind = (typeof PACKAGED_AGENT_KINDS)[number];

export const INTERNAL_AGENT_KINDS = ["shadow"] as const;
export type InternalAgentKind = (typeof INTERNAL_AGENT_KINDS)[number];

const PACKAGED_AGENT_LABELS: Record<
	PackagedAgentKind,
	{ name: string; description: string; toolsPreset: "readonly" | "coding" }
> = {
	shadow: {
		name: "Shadow",
		description: "Internal shadow collaborator: memory, security review, parent messaging",
		toolsPreset: "readonly",
	},
	intro: {
		name: "Intro",
		description: "Onboarding guide: teach Supervisor usage and inspect resources",
		toolsPreset: "readonly",
	},
};

export interface AgentMetaRecord {
	builtin?: boolean;
	packagedKind?: PackagedAgentKind;
	internalKind?: string;
	userSpawnable?: boolean;
	[key: string]: unknown;
}

export function getPackagedAgentsDir(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	const dir = join(here, "../../agents");
	if (!existsSync(dir)) {
		throw new Error(`Packaged agents directory not found: ${dir}`);
	}
	return dir;
}

export function loadPackagedAgentPrompt(kind: PackagedAgentKind): string {
	const filePath = join(getPackagedAgentsDir(), kind, "prompt.md");
	if (!existsSync(filePath)) {
		throw new Error(`Missing packaged agent prompt: ${filePath}`);
	}
	return readFileSync(filePath, "utf-8").trim();
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
	if (agent.isInternal) return false;
	const meta = parseAgentMeta(agent);
	if (meta.userSpawnable === false) return false;
	return true;
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

export function findPackagedAgentId(
	db: SupervisorDb,
	kind: PackagedAgentKind,
): number | undefined {
	for (const agent of db.listAgents()) {
		const meta = parseAgentMeta(agent);
		if (meta.packagedKind === kind) return agent.id;
		if (kind === "shadow" && agent.isInternal && meta.internalKind === "shadow") return agent.id;
		if (kind === "intro" && meta.internalKind === "resource-manager") return agent.id;
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
	const isInternal = kind === "shadow";

	if (existing !== undefined) {
		const agent = db.getAgent(existing);
		if (agent) {
			const homeDir = agent.homeDir ?? getAgentHomeDir(agent.id);
			ensureAgentHome(agent.id, homeDir);
			writeAgentHomeSystemPrompt(homeDir, loadPackagedAgentPrompt(kind));
			if (agent.isInternal !== isInternal || agent.name !== label.name) {
				db.updateAgent(existing, {
					name: label.name,
					description: label.description,
					is_internal: isInternal ? 1 : 0,
					meta: {
						...parseAgentMeta(agent),
						packagedKind: kind,
						internalKind: undefined,
						internal: undefined,
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
			packagedKind: kind,
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
