import type { ExtensionContext } from "../extension-system/types.js";
import { getAgentHomeDir } from "../agent/agent-paths.js";
import { loadAgentSessionResources } from "../agent/agent-resources.js";
import { loadSkills, type Skill } from "../agent/skills.js";
import { loadPromptTemplates } from "../agent/prompt-templates.js";
import { listEnabledPackagedToolIds } from "../tools/loader.js";
import { listAgentResourcePathsFromSqlite, listAgentToolSlugsFromSqlite } from "../resources/sqlite-bindings.js";
import type { Agent } from "../types.js";
import {
	DEFAULT_SHADOW_MEMBER_TAG,
	LEGACY_SHADOW_MEMBER_TAGS,
	SUPERVISOR_RESOURCE_SCHEME,
} from "./constants.js";
import {
	agentPromptUrl,
	agentResourceUrl,
	agentSkillUrl,
	sessionResourceUrl,
} from "./urls.js";

export interface SupervisorResourceEntry {
	url: string;
	kind: string;
	name?: string;
	description?: string;
}

export interface SupervisorResourceCatalog {
	scheme: typeof SUPERVISOR_RESOURCE_SCHEME;
	sessionId: number;
	agentId: number;
	resources: SupervisorResourceEntry[];
}

function shadowTags(): string[] {
	return [DEFAULT_SHADOW_MEMBER_TAG, ...LEGACY_SHADOW_MEMBER_TAGS];
}

export async function listSupervisorResources(ctx: ExtensionContext): Promise<SupervisorResourceCatalog> {
	const resources: SupervisorResourceEntry[] = [];
	const sessionId = ctx.session.id;
	const agentId = ctx.agent.id;

	resources.push({
		url: sessionResourceUrl(sessionId),
		kind: "session",
		name: `session-${sessionId}`,
		description: "Current session summary",
	});
	for (const resource of ["messages", "branch", "result"] as const) {
		resources.push({
			url: sessionResourceUrl(sessionId, resource),
			kind: `session-${resource}`,
			description: `Current session ${resource}`,
		});
	}

	const children = await ctx.session.children();
	for (const child of children) {
		resources.push({
			url: sessionResourceUrl(child.id),
			kind: "session-child",
			name: `session-${child.id}`,
			description: "Direct child session summary",
		});
		resources.push({
			url: sessionResourceUrl(child.id, "messages"),
			kind: "session-child-messages",
			description: "Direct child session messages",
		});
		resources.push({
			url: sessionResourceUrl(child.id, "result"),
			kind: "session-child-result",
			description: "Direct child session latest result",
		});
	}

	const agentStub = { id: agentId, homeDir: getAgentHomeDir(agentId) } as Agent;
	const sqlite = ctx.db.sqlite;
	const skillPaths = sqlite ? listAgentResourcePathsFromSqlite(sqlite, agentId, "skill") : [];
	const promptPaths = sqlite ? listAgentResourcePathsFromSqlite(sqlite, agentId, "prompt") : [];
	const { skills } = loadSkills({
		cwd: ctx.project.cwd,
		agentHomeDir: agentStub.homeDir!,
		skillPaths,
		includeDefaults: skillPaths.length === 0,
		includeProject: false,
	});
	const promptTemplates = loadPromptTemplates({
		cwd: ctx.project.cwd,
		agentHomeDir: agentStub.homeDir!,
		promptPaths,
		includeDefaults: promptPaths.length === 0,
		includeProject: false,
	});

	resources.push({
		url: agentResourceUrl(agentId),
		kind: "agent",
		name: ctx.agent.name,
		description: "Current agent profile, tools, and linked resources",
	});

	for (const skill of skills) {
		resources.push({
			url: agentSkillUrl(agentId, skill.name),
			kind: "skill",
			name: skill.name,
			description: skill.description,
		});
	}

	for (const prompt of promptTemplates) {
		resources.push({
			url: agentPromptUrl(agentId, prompt.name),
			kind: "prompt",
			name: prompt.name,
			description: prompt.description,
		});
	}

	const homeDir = getAgentHomeDir(agentId);
	const toolSlugs = sqlite ? listAgentToolSlugsFromSqlite(sqlite, agentId) : [];
	const toolIds = toolSlugs.length > 0 ? toolSlugs : listEnabledPackagedToolIds(homeDir);
	for (const toolId of toolIds) {
		resources.push({
			url: agentResourceUrl(agentId, `tools/${toolId}`),
			kind: "packaged-tool",
			name: toolId,
			description: `Enabled packaged tool: ${toolId}`,
		});
	}

	for (const tag of shadowTags()) {
		const members = await ctx.session.members.byTag(tag);
		for (const member of members) {
			resources.push({
				url: agentResourceUrl(member.id),
				kind: "shadow-member",
				name: member.name,
				description: `Shadow collaborator (tag: ${tag})`,
			});
		}
	}

	const spawned = await ctx.session.members.byRole("spawned");
	for (const member of spawned) {
		resources.push({
			url: agentResourceUrl(member.id),
			kind: "spawned-member",
			name: member.name,
			description: `Spawnable subagent member (tags: ${member.tags.join(", ") || "none"})`,
		});
	}

	return {
		scheme: SUPERVISOR_RESOURCE_SCHEME,
		sessionId,
		agentId,
		resources,
	};
}
