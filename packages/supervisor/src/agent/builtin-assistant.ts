import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	ensureAgentHome,
	ensureGlobalResourceDirs,
	getAgentHomeDir,
	linkGlobalResourceToAgent,
	writeAgentHomeSystemPrompt,
} from "./agent-paths.js";
import { loadPromptTemplate } from "./system-prompts.js";
import { getDefaultCwd } from "../config/default-cwd.js";
import type { SessionManager } from "../core/session-manager.js";

const BUILTIN_AGENT_NAME = "Pi 助手";
const BUILTIN_SESSION_NAME = "Pi 助手";

const BUILTIN_SYSTEM_PROMPT = loadPromptTemplate("builtin-assistant-system");

const SUPERVISOR_GUIDE_SKILL = loadPromptTemplate("builtin-assistant-skill");

function pickProvider(db: SupervisorDb): { providerId: number; modelId: string } | null {
	const providers = db.listProviders().filter((p) => p.isEnabled);
	for (const p of providers) {
		const models = db.listModels().filter((m) => m.providerId === p.id);
		if (models.length > 0) return { providerId: p.id, modelId: models[0].modelId };
	}
	return null;
}

function findBuiltinAgentId(db: SupervisorDb): number | undefined {
	for (const agent of db.listAgents()) {
		if ((agent.meta as any)?.builtin === true) return agent.id;
	}
	return undefined;
}

function findBuiltinSessionId(db: SupervisorDb): number | undefined {
	for (const session of db.list()) {
		if ((session.meta as any)?.builtin === true) return session.id;
	}
	return undefined;
}

function installBuiltinSkill(agentHomeDir: string): void {
	const globalRoot = ensureGlobalResourceDirs();
	const skillDir = join(globalRoot, "skills", "supervisor-guide");
	mkdirSync(skillDir, { recursive: true });
	const skillPath = join(skillDir, "SKILL.md");
	if (!existsSync(skillPath)) {
		writeFileSync(skillPath, SUPERVISOR_GUIDE_SKILL, "utf8");
	}
	try {
		linkGlobalResourceToAgent(agentHomeDir, "skills", skillDir);
	} catch {
		// already linked or platform issue - non-fatal
	}
}

/** Ensure built-in Pi assistant agent and pinned session exist. Does not block server listen. */
export function ensureBuiltinAssistant(db: SupervisorDb, manager: SessionManager): void {
	const providerPick = pickProvider(db);
	if (!providerPick) {
		console.warn("[pi-supervisor] No provider configured - skipping built-in Pi assistant setup");
		return;
	}

	const { providerId, modelId } = providerPick;
	let agentId = findBuiltinAgentId(db);
	let agent = agentId !== undefined ? db.getAgent(agentId) : undefined;

	if (!agent) {
		agent = db.insertAgent({
			name: BUILTIN_AGENT_NAME,
			description: "Supervisor 内置助手：配置、迁移插件、安装 skill 等",
			provider_id: providerId,
			model_id: modelId,
			tools_preset: "coding",
			meta: { builtin: true },
		});
		agentId = agent.id;
	}

	const homeDir = agent.homeDir ?? getAgentHomeDir(agent.id);
	ensureAgentHome(agent.id, homeDir);
	writeAgentHomeSystemPrompt(homeDir, BUILTIN_SYSTEM_PROMPT);
	installBuiltinSkill(homeDir);

	let sessionId = findBuiltinSessionId(db);
	if (!sessionId) {
		const session = manager.create({
			agentId: agent.id,
			cwd: getDefaultCwd(),
			meta: {
				name: BUILTIN_SESSION_NAME,
				pinned: true,
				builtin: true,
				description: "Supervisor 内置助手会话",
			},
		});
		sessionId = session.id;
	}

	const session = sessionId !== undefined ? db.get(sessionId) : undefined;
	if (session) {
		const meta = typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta;
		db.updateMeta(sessionId, {
			...meta,
			name: BUILTIN_SESSION_NAME,
			pinned: true,
			builtin: true,
		});
	}
}
