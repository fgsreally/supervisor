import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { getAgentHomeDir, readAgentHomeSystemPrompt } from "../agent/agent-paths.js";
import type { SupervisorDb } from "../db/db.js";
import {
	collectExtensionPaths,
	listExtensionInfosInDirectories,
	filterExtensionInfosByDir,
	loadExtensions,
	type ExtensionEntryInfo,
} from "../extension-system/loader.js";
import { probeExtensionTools } from "../extension-system/tool-probe.js";
import { listEnabledPackagedToolIds, probePackagedTool, isPackagedToolId } from "../tools/loader.js";
import { createDefaultTools } from "../utils/default-tools.js";
import { loadPromptTemplates, type PromptTemplate } from "./prompt-templates.js";
import { loadSkills, type Skill } from "./skills.js";
import type { Agent, ToolsPreset } from "../types.js";

export interface SkillFileInfo {
	relativePath: string;
	content: string;
}

export interface SkillInfo {
	name: string;
	description: string;
	/** Skill directory (parent of SKILL.md). */
	filePath: string;
	files: SkillFileInfo[];
}

export interface PromptTemplateInfo {
	name: string;
	description: string;
	filePath: string;
	content: string;
}

export interface ExtensionPathInfo {
	entryPath: string;
	fileName: string;
}

export interface ExtensionResourceInfo {
	/** Extension id = rootDir basename (or fileName without ext for flat files). */
	id: string;
	/** Discovery root directory (subdir for package extensions, parent dir for flat files). */
	rootDir: string;
	/** Absolute entry file path. */
	entryPath: string;
	/** Entry file name (e.g. "index.ts"). */
	fileName: string;
	/** Display name from package.json (if any). */
	name: string | null;
	/** Version from package.json (if any). */
	version: string | null;
	/** Description from package.json (if any). */
	description: string | null;
	/** True if extension is a single .ts/.js file (no package.json). */
	isFlatFile: boolean;
	/** All files in the extension directory. */
	files: ExtensionFileInfo[];
}

export interface ExtensionFileInfo {
	relativePath: string;
	content: string;
}

export interface ResourceLayer {
	skills: SkillInfo[];
	prompts: PromptTemplateInfo[];
	extensions: ExtensionResourceInfo[];
}

export interface AgentToolInfo {
	name: string;
	source: "preset" | "extension" | "system";
	extensionName?: string;
	description?: string;
}

export interface AgentResources {
	agentId: number;
	homeDir: string;
	systemMd: string;
	toolsPreset: ToolsPreset | null;
	tools: AgentToolInfo[];
	layers: {
		agent: ResourceLayer;
	};
}

function readSkillDirectory(baseDir: string): SkillFileInfo[] {
	if (!existsSync(baseDir)) return [];
	const files: SkillFileInfo[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath);
			} else {
				files.push({
					relativePath: relative(baseDir, fullPath).replace(/\\/g, "/"),
					content: readFileSync(fullPath, "utf-8"),
				});
			}
		}
	};
	walk(baseDir);
	return files;
}

function readExtensionDirectory(rootDir: string, entryPath: string, isFlatFile: boolean): ExtensionFileInfo[] {
	if (!existsSync(rootDir)) return [];

	if (isFlatFile) {
		// For flat files, just read the single file
		try {
			const content = readFileSync(entryPath, "utf-8");
			const fileName = entryPath.split(/[/\\]/).pop() ?? entryPath;
			return [{ relativePath: fileName, content }];
		} catch {
			return [];
		}
	}

	// For directory extensions, read all files
	const files: ExtensionFileInfo[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				// Skip node_modules for performance
				if (entry.name === "node_modules") continue;
				walk(fullPath);
			} else {
				files.push({
					relativePath: relative(rootDir, fullPath).replace(/\\/g, "/"),
					content: readFileSync(fullPath, "utf-8"),
				});
			}
		}
	};
	walk(rootDir);
	return files;
}

function skillToInfo(skill: Skill): SkillInfo {
	return {
		name: skill.name,
		description: skill.description,
		filePath: skill.baseDir,
		files: readSkillDirectory(skill.baseDir),
	};
}

function promptToInfo(template: PromptTemplate): PromptTemplateInfo {
	let content = "";
	try {
		content = readFileSync(template.filePath, "utf-8");
	} catch {
		content = `# ${template.name}\n\n${template.description}`;
	}
	return {
		name: template.name,
		description: template.description,
		filePath: template.filePath,
		content,
	};
}

function isUnderDir(filePath: string, dir: string): boolean {
	const normalizedFile = filePath.replace(/\\/g, "/");
	const normalizedDir = dir.replace(/\\/g, "/").replace(/\/$/, "");
	return normalizedFile === normalizedDir || normalizedFile.startsWith(`${normalizedDir}/`);
}

function filterSkillsByDir(skills: Skill[], dir: string): SkillInfo[] {
	return skills.filter((s) => isUnderDir(s.baseDir, dir)).map(skillToInfo);
}

function filterPromptsByDir(prompts: PromptTemplate[], dir: string): PromptTemplateInfo[] {
	return prompts.filter((p) => isUnderDir(p.filePath, dir)).map(promptToInfo);
}

function filterExtensionsByDir(paths: string[], dir: string): ExtensionPathInfo[] {
	return paths
		.filter((p) => isUnderDir(p, dir))
		.map((entryPath) => ({
			entryPath,
			fileName: entryPath.split(/[/\\]/).pop() ?? entryPath,
		}));
}

function extensionEntryInfoToResourceInfo(info: ExtensionEntryInfo): ExtensionResourceInfo {
	return {
		id: info.id,
		rootDir: info.rootDir,
		entryPath: info.entryPath,
		fileName: info.fileName,
		name: info.name,
		version: info.version,
		description: info.description,
		isFlatFile: info.isFlatFile,
		files: readExtensionDirectory(info.rootDir, info.entryPath, info.isFlatFile),
	};
}

export function skillsToResourceInfo(skills: Skill[]): SkillInfo[] {
	return skills.map(skillToInfo);
}

export function promptsToResourceInfo(prompts: PromptTemplate[]): PromptTemplateInfo[] {
	return prompts.map(promptToInfo);
}

/** Load skills/prompts for session runtime from DB bindings. */
export function loadAgentSessionResources(
	db: SupervisorDb,
	agent: Agent | undefined,
	cwd: string,
): { skills: Skill[]; promptTemplates: PromptTemplate[]; systemMd: string } {
	const agentHomeDir = agent?.homeDir ?? getAgentHomeDir(agent?.id ?? "default");
	const agentId = agent?.id;

	const skillPaths =
		agentId !== undefined
			? db
					.listAgentResources(agentId, "skill")
					.map((b) => b.resource?.sourcePath)
					.filter((p): p is string => Boolean(p))
			: [];
	const promptPaths =
		agentId !== undefined
			? db
					.listAgentResources(agentId, "prompt")
					.map((b) => b.resource?.sourcePath)
					.filter((p): p is string => Boolean(p))
			: [];

	const { skills } = loadSkills({
		cwd,
		agentHomeDir,
		skillPaths,
		includeDefaults: skillPaths.length === 0,
		includeProject: false,
	});

	const promptTemplates = loadPromptTemplates({
		cwd,
		agentHomeDir,
		promptPaths,
		includeDefaults: promptPaths.length === 0,
		includeProject: false,
	});

	const systemMd = readAgentHomeSystemPrompt(agentHomeDir);

	return { skills, promptTemplates, systemMd };
}

/** Extension paths from filesystem only (agent home dir). */
export function listExtensionPathsFromDirs(agent: Agent | undefined, cwd: string, includeProject: boolean): string[] {
	const agentHomeDir = agent?.homeDir ?? getAgentHomeDir(agent?.id ?? "default");
	const dirs = [join(agentHomeDir, "extensions")];
	if (includeProject) {
		dirs.push(join(cwd, ".pi", "supervisor", "extensions"));
	}
	return listExtensionInfosInDirectories(dirs).map((info) => info.entryPath);
}

const SYSTEM_TOOLS: Array<Pick<AgentToolInfo, "name" | "source" | "description">> = [
	{ name: "send_parent_msg", source: "system", description: "Enqueue a message for the parent session (shadow child only)" },
	{ name: "list_supervisor_resources", source: "system", description: "List readable pi-supervisor:// resources" },
	{ name: "spawn_agent", source: "system", description: "Spawn a delegated subagent session" },
	{ name: "read_supervisor_resource", source: "system", description: "Read pi-supervisor resource URLs" },
];

/** Resolve the effective tool set for an agent (preset + system + bound extensions). */
export async function resolveAgentTools(
	db: SupervisorDb,
	agentId: number,
	cwd: string,
	extensionRegistry?: { getMany(slugs: string[]): Array<{ definition: import("../extension-system/types.js").ExtensionDefinition; error?: string }> },
): Promise<AgentToolInfo[]> {
	const agent = db.getAgent(agentId);
	if (!agent) {
		throw new Error(`Agent ${agentId} not found`);
	}

	const merged = new Map<string, AgentToolInfo>();

	for (const tool of createDefaultTools(cwd, agent.toolsPreset ?? "coding")) {
		merged.set(tool.name, {
			name: tool.name,
			source: "preset",
			description: tool.description,
		});
	}

	for (const tool of SYSTEM_TOOLS) {
		merged.set(tool.name, tool);
	}

	const extensionSlugs = db.listAgentResourceSlugs(agentId, "extension");
	if (extensionRegistry) {
		for (const mod of extensionRegistry.getMany(extensionSlugs)) {
			if (mod.error) continue;
			const probed = await probeExtensionTools(mod.definition);
			for (const tool of probed) {
				merged.set(tool.name, {
					name: tool.name,
					source: "extension",
					extensionName: tool.extensionName,
					description: tool.description,
				});
			}
		}
	} else {
		const roots = extensionSlugs
			.map((slug) => db.getResourceByKindSlug("extension", slug)?.sourcePath)
			.filter((p): p is string => Boolean(p));
		const extPaths = listExtensionInfosInDirectories(roots).map((info) => info.entryPath);
		const loaded = await loadExtensions(extPaths);
		for (const ext of loaded.extensions) {
			if (ext.error) continue;
			const probed = await probeExtensionTools(ext.definition);
			for (const tool of probed) {
				merged.set(tool.name, {
					name: tool.name,
					source: "extension",
					extensionName: tool.extensionName,
					description: tool.description,
				});
			}
		}
	}

	const toolSlugs = db.listAgentResourceSlugs(agentId, "tool");
	const homeDir = agent.homeDir ?? getAgentHomeDir(agent.id);
	const legacyToolIds =
		toolSlugs.length > 0 ? toolSlugs : (listEnabledPackagedToolIds(homeDir) as string[]);
	for (const toolId of legacyToolIds) {
		if (!isPackagedToolId(toolId)) continue;
		const probed = await probePackagedTool(toolId, cwd);
		for (const tool of probed) {
			if (tool.name === "(hook)") continue;
			merged.set(tool.name, {
				name: tool.name,
				source: "extension",
				extensionName: toolId,
				description: tool.description,
			});
		}
	}

	return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** API/UI: agent resources from DB bindings. */
export async function resolveAgentResources(
	db: SupervisorDb,
	agentId: number,
	cwd: string,
	extensionRegistry?: { getMany(slugs: string[]): Array<{ definition: import("../extension-system/types.js").ExtensionDefinition; error?: string; slug: string; path: string }> },
): Promise<AgentResources> {
	const agent = db.getAgent(agentId);
	if (!agent) {
		throw new Error(`Agent ${agentId} not found`);
	}

	const homeDir = agent.homeDir ?? getAgentHomeDir(agent.id);
	const { skills, promptTemplates, systemMd } = loadAgentSessionResources(db, agent, cwd);

	const bindings = db.listAgentResources(agentId);
	const boundSkillPaths = new Set(
		bindings
			.filter((b) => b.resource?.kind === "skill" && b.resource.sourcePath)
			.map((b) => b.resource!.sourcePath!),
	);
	const boundPromptPaths = new Set(
		bindings
			.filter((b) => b.resource?.kind === "prompt" && b.resource.sourcePath)
			.map((b) => b.resource!.sourcePath!),
	);

	const agentSkills =
		boundSkillPaths.size > 0
			? skillsToResourceInfo(skills.filter((s) => boundSkillPaths.has(s.filePath)))
			: skillsToResourceInfo(skills);
	const agentPrompts =
		boundPromptPaths.size > 0
			? promptsToResourceInfo(promptTemplates.filter((p) => boundPromptPaths.has(p.filePath)))
			: promptsToResourceInfo(promptTemplates);

	const agentExtensions = bindings
		.filter((b) => b.resource?.kind === "extension")
		.map((b) => {
			const rootDir = b.resource?.sourcePath;
			if (!rootDir) return null;
			const infos = listExtensionInfosInDirectories([rootDir]);
			const info = infos.find((i) => i.id === b.resource?.slug) ?? infos[0];
			return info ? extensionEntryInfoToResourceInfo(info) : null;
		})
		.filter((e): e is ExtensionResourceInfo => e !== null);

	const tools = await resolveAgentTools(db, agentId, cwd, extensionRegistry);

	return {
		agentId: agent.id,
		homeDir,
		systemMd,
		toolsPreset: agent.toolsPreset,
		tools,
		layers: {
			agent: {
				skills: agentSkills,
				prompts: agentPrompts,
				extensions: agentExtensions,
			},
		},
	};
}

