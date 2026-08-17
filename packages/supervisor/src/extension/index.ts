import type {
  AgentExtensionDefinition,
  AnyExtensionDefinition,
  SessionExtensionDefinition,
} from "./types.js";

export { Type, type Static, type TSchema } from "typebox";
export {
  createSkillExtension,
  evalExtension,
  mcpExtension,
  messageAssetsExtension,
  projectServicesExtension,
  gitExtension,
  shadowExtension,
  subagentExtension,
  supervisorAdminExtension,
  taskManagementExtension,
  timerExtension,
  toolLoopGuardExtension,
  BUILTIN_EXTENSIONS,
  BUILTIN_EXTENSION_SLUGS,
  isBuiltinExtensionResource,
  ensureAgentBuiltinExtensionBindings,
  ensureBuiltinExtensionResources,
  listEnabledBuiltinExtensionSlugs,
} from "./builtin/index.js";

/** Define and validate an extension. */
export function defineExtension(
  definition: SessionExtensionDefinition,
): SessionExtensionDefinition {
  if (!definition.name || typeof definition.name !== "string") {
    throw new Error("Extension name is required and must be a string");
  }
  if (!definition.setup || typeof definition.setup !== "function") {
    throw new Error("Extension setup function is required");
  }
  return definition;
}

/** Define an extension whose setup runs once for each Agent runtime generation. */
export function defineAgentExtension(
  definition: Omit<AgentExtensionDefinition, "scope"> & { scope?: "agent" },
): AgentExtensionDefinition {
  if (!definition.name || typeof definition.name !== "string") {
    throw new Error("Extension name is required and must be a string");
  }
  if (!definition.setup || typeof definition.setup !== "function") {
    throw new Error("Extension setup function is required");
  }
  return { ...definition, scope: "agent" };
}

export function isAgentExtension(
  definition: AnyExtensionDefinition,
): definition is AgentExtensionDefinition {
  return "scope" in definition && definition.scope === "agent";
}

export * from "./loader.js";
export type * from "./types.js";
