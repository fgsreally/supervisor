import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { TSchema } from "typebox";
import { getAgentHomeDir, readAgentHomeSystemPrompt } from "./index.js";
import { ContextAgent, ContextDb, ContextSession, ToolPolicy } from "../extension/runtime/index.js";
import type { SupervisorDb } from "../db/db.js";
import { listExtensionInfosInDirectories, type ExtensionEntryInfo } from "../extension/index.js";
import type { ExtensionModuleRegistry } from "../extension/registry.js";
import type { ExtensionContext, ExtensionDefinition, ToolDefinition } from "../extension/index.js";
import { isPackagedToolId, probePackagedTool } from "../tools/catalog.js";
import { createDefaultTools } from "../utils/default-tools.js";
import { loadPromptTemplates, type PromptTemplate } from "./prompt-templates.js";
import { loadSkills, type Skill } from "./skills.js";
import type { Agent, ToolsPreset } from "../types.js";
import type { Resource } from "../resources/types.js";

interface ProbedTool {
  name: string;
  description: string;
  extensionName: string;
}

async function probeExtensionTools(definition: ExtensionDefinition): Promise<ProbedTool[]> {
  const registered: ProbedTool[] = [];
  const ctx = createProbeContext((tool) => {
    registered.push({
      name: tool.name,
      description: tool.description,
      extensionName: definition.name,
    });
  });
  try {
    await definition.setup(ctx);
  } catch {
    // Tool discovery is best effort; keep registrations made before setup failed.
  }
  return registered;
}

function createProbeContext(
  onRegister: (tool: ToolDefinition<TSchema, unknown>) => void,
): ExtensionContext {
  const noop = () => undefined;
  const noopAsync = async () => undefined;
  const toolRegistry = {
    register: <TParams extends TSchema, TResult>(definition: ToolDefinition<TParams, TResult>) => {
      onRegister(definition as ToolDefinition<TSchema, unknown>);
    },
    list: () => [],
    get: () => undefined,
  };

  return {
    db: new ContextDb(undefined),
    session: new ContextSession({
      id: 0,
      cwd: process.cwd(),
      dir: process.cwd(),
      isMain: true,
      isChild: false,
      getDir: async () => process.cwd(),
      isIdle: () => true,
      isStreaming: () => false,
      getSignal: () => undefined,
      abort: noop,
      waitForIdle: noopAsync,
      messages: {
        list: async () => [],
        get: async () => undefined,
        tree: async () => [],
        currentBranch: async () => [],
        search: async () => [],
        getMeta: async () => ({}),
        setMeta: noopAsync,
        patchMeta: async () => ({}),
        setLabel: noopAsync,
        stats: async () => ({ total: 0, user: 0, assistant: 0, tool: 0, custom: 0 }),
        contextUsage: async () => ({ tokens: null, contextWindow: 0, percent: null }),
      },
      meta: { get: async () => ({}), set: noopAsync, patch: async () => ({}) },
      workflow: {
        get: async () => null,
        set: async () => {
          throw new Error("workflow is unavailable while probing resources");
        },
        clear: noopAsync,
      },
      getParent: async () => undefined,
      children: async () => [],
      appendEntry: async () => "",
      sendMessage: noopAsync,
      sendCustomMessage: async () => "",
      sendUserMessage: noopAsync,
      sendToChild: noopAsync,
      pausing: async <T>(_reason: string, work: Promise<T> | (() => Promise<T>)) =>
        typeof work === "function" ? work() : work,
      spawn: async () => ({ sessionId: 0, parentId: null, status: "idle", agentId: null }),
      waitForResult: async () => ({
        sessionId: 0,
        status: "idle",
        result: "",
        truncated: false,
      }),
      finish: noopAsync,
      fork: async () => ({
        id: 0,
        cwd: process.cwd(),
        messageCount: 0,
        createdAt: 0,
        lastActiveAt: 0,
      }),
      switchTo: noopAsync,
      navigateTree: noopAsync,
      compact: async () => ({ summary: "", firstKeptEntryId: "", tokensBefore: 0 }),
      tools: {
        setPolicy: noop,
        getPolicy: () => ToolPolicy.coding(),
        beforeUse: () => noop,
        afterUse: () => noop,
        enable: noop,
        disable: noop,
        setActive: noopAsync,
        getActive: () => null,
      },
    }),
    agent: new ContextAgent({
      id: 0,
      name: "probe",
      providerId: 0,
      modelId: "probe",
      getModel: () => ({ provider: "probe", id: "probe", contextWindow: 0 }),
      registerTool: toolRegistry.register,
      unregisterTool: noop,
      listTools: toolRegistry.list,
      getTool: toolRegistry.get,
      findByTag: async () => [],
      findByRole: async () => [],
      setModel: noopAsync,
      setThinkingLevel: noop,
      getThinkingLevel: () => "none" as const,
    }),
    tools: {
      list: toolRegistry.list,
      get: toolRegistry.get,
      call: async () => {
        throw new Error("Tool execution is unavailable while probing resources");
      },
    },
    project: { cwd: process.cwd(), dir: process.cwd(), getDir: async () => process.cwd() },
    ui: { broadcast: noop, requestApproval: async () => ({ action: "approve" as const }) },
    on: () => noop,
    log: noop,
    exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false, duration: 0 }),
    events: { emit: noop, on: () => noop, off: noop },
    flow: {
      continue: async () => ({ queued: false }),
      pause: noopAsync,
      resume: noopAsync,
      acquireLock: async () => null,
      usage: async () => ({ turns: 0, tokens: 0, wallClockMs: 0, contextTokens: null }),
      startScope: noop,
      endScope: noop,
    },
    inject: { schedule: noop, clear: noop, reattach: noop },
  };
}

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
  /** All files in the extension directory. */
  files: ExtensionFileInfo[];
}

export interface ExtensionFileInfo {
  relativePath: string;
  content: string;
}

export interface McpResourceInfo {
  id: string;
  name: string;
  description: string;
  filePath: string;
  content: string;
}

export interface ResourceLayer {
  skills: SkillInfo[];
  prompts: PromptTemplateInfo[];
  extensions: ExtensionResourceInfo[];
  mcp: McpResourceInfo[];
}

export function mcpResourcesToInfo(resources: Resource[]): McpResourceInfo[] {
  return resources.flatMap((resource) => {
    if (resource.kind !== "mcp" || !resource.sourcePath || !existsSync(resource.sourcePath)) {
      return [];
    }
    return [
      {
        id: resource.slug,
        name: resource.name ?? resource.slug,
        description: resource.description ?? "MCP server configuration",
        filePath: resource.sourcePath,
        content: readFileSync(resource.sourcePath, "utf-8"),
      },
    ];
  });
}

export interface AgentToolInfo {
  name: string;
  source: "preset" | "extension" | "system";
  extensionName?: string;
  description?: string;
  enabled: boolean;
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

function readExtensionDirectory(rootDir: string): ExtensionFileInfo[] {
  if (!existsSync(rootDir)) return [];

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

function extensionEntryInfoToResourceInfo(info: ExtensionEntryInfo): ExtensionResourceInfo {
  return {
    id: info.id,
    rootDir: info.rootDir,
    entryPath: info.entryPath,
    fileName: info.fileName,
    name: info.name,
    version: info.version,
    description: info.description,
    files: readExtensionDirectory(info.rootDir),
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
    skillPaths,
  });

  const promptTemplates = loadPromptTemplates({
    cwd,
    promptPaths,
  });

  const systemMd = readAgentHomeSystemPrompt(agentHomeDir);

  return { skills, promptTemplates, systemMd };
}

const SYSTEM_TOOLS: Array<Pick<AgentToolInfo, "name" | "source" | "description">> = [
  { name: "spawn_agent", source: "system", description: "Spawn a delegated subagent session" },
];

/** Resolve the effective tool set for an agent (preset + system + bound extensions). */
export async function resolveAgentTools(
  db: SupervisorDb,
  agentId: number,
  cwd: string,
  extensionRegistry: ExtensionModuleRegistry,
): Promise<AgentToolInfo[]> {
  const agent = db.getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  const merged = new Map<string, AgentToolInfo>();
  const disabledTools = new Set(
    Array.isArray(agent.meta?.disabledTools)
      ? agent.meta.disabledTools.filter((name): name is string => typeof name === "string")
      : [],
  );

  for (const tool of createDefaultTools(cwd, agent.toolsPreset ?? "coding")) {
    merged.set(tool.name, {
      name: tool.name,
      source: "preset",
      description: tool.description,
      enabled: !disabledTools.has(tool.name),
    });
  }

  for (const tool of SYSTEM_TOOLS) {
    merged.set(tool.name, { ...tool, enabled: !disabledTools.has(tool.name) });
  }

  const extensionSlugs = db.listAgentResourceSlugs(agentId, "extension");
  for (const mod of extensionRegistry.getMany(extensionSlugs)) {
    if (mod.error) continue;
    const probed = await probeExtensionTools(mod.definition);
    for (const tool of probed) {
      merged.set(tool.name, {
        name: tool.name,
        source: "extension",
        extensionName: tool.extensionName,
        description: tool.description,
        enabled: !disabledTools.has(tool.name),
      });
    }
  }

  const toolSlugs = db.listAgentResourceSlugs(agentId, "tool");
  for (const toolId of toolSlugs) {
    if (!isPackagedToolId(toolId)) continue;
    const probed = await probePackagedTool(toolId, cwd);
    for (const tool of probed) {
      if (tool.name === "(hook)") continue;
      merged.set(tool.name, {
        name: tool.name,
        source: "extension",
        extensionName: toolId,
        description: tool.description,
        enabled: !disabledTools.has(tool.name),
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
  extensionRegistry: ExtensionModuleRegistry,
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
      ? skillsToResourceInfo(
          skills.filter(
            (skill) => boundSkillPaths.has(skill.baseDir) || boundSkillPaths.has(skill.filePath),
          ),
        )
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
  const agentMcp = mcpResourcesToInfo(
    bindings.flatMap((binding) => (binding.resource?.kind === "mcp" ? [binding.resource] : [])),
  );

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
        mcp: agentMcp,
      },
    },
  };
}
