import type {
  AgentPluginDefinition,
  AnyPluginDefinition,
  SessionPluginDefinition,
} from "./types.js";

export { Type, type Static, type TSchema } from "typebox";
export {
  createSkillPlugin,
  evalPlugin,
  mcpPlugin,
  messageAssetsPlugin,
  projectServicesPlugin,
  gitPlugin,
  shadowPlugin,
  subagentPlugin,
  wecodeAdminPlugin,
  taskManagementPlugin,
  timerPlugin,
  toolLoopGuardPlugin,
  BUILTIN_PLUGINS,
  BUILTIN_PLUGIN_SLUGS,
  isBuiltinPluginResource,
  ensureAgentBuiltinPluginBindings,
  ensureBuiltinPluginResources,
  listEnabledBuiltinPluginSlugs,
} from "./builtin/index.js";

/** Define and validate a plugin. */
export function definePlugin(
  definition: SessionPluginDefinition,
): SessionPluginDefinition {
  if (!definition.name || typeof definition.name !== "string") {
    throw new Error("Plugin name is required and must be a string");
  }
  if (!definition.setup || typeof definition.setup !== "function") {
    throw new Error("Plugin setup function is required");
  }
  return definition;
}

/** Define a plugin whose setup runs once for each Agent runtime generation. */
export function defineAgentPlugin(
  definition: Omit<AgentPluginDefinition, "scope"> & { scope?: "agent" },
): AgentPluginDefinition {
  if (!definition.name || typeof definition.name !== "string") {
    throw new Error("Plugin name is required and must be a string");
  }
  if (!definition.setup || typeof definition.setup !== "function") {
    throw new Error("Plugin setup function is required");
  }
  return { ...definition, scope: "agent" };
}

export function isAgentPlugin(
  definition: AnyPluginDefinition,
): definition is AgentPluginDefinition {
  return "scope" in definition && definition.scope === "agent";
}

export * from "./loader.js";
export { ensurePluginExternalAgents } from "./external-agents.js";
export type * from "./types.js";
