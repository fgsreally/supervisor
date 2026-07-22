import type { ExtensionDefinition } from "./types.js";

export { Type, type Static, type TSchema } from "typebox";
export {
  createSkillExtension,
  evalExtension,
  mcpExtension,
  messageAssetsExtension,
  persistentBashExtension,
  shadowExtension,
  subagentExtension,
  taskManagementExtension,
  timerExtension,
} from "./builtin/index.js";

/** Define and validate an extension. */
export function defineExtension(definition: ExtensionDefinition): ExtensionDefinition {
  if (!definition.name || typeof definition.name !== "string") {
    throw new Error("Extension name is required and must be a string");
  }
  if (!definition.setup || typeof definition.setup !== "function") {
    throw new Error("Extension setup function is required");
  }
  return definition;
}

export * from "./loader.js";
export type * from "./types.js";
