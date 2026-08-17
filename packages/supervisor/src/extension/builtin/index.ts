export { default as mcpExtension } from "./mcp/index.js";
export { default as subagentExtension } from "./subagent/index.js";
export { createSkillExtension } from "./skill/index.js";
export { default as messageAssetsExtension } from "./message-assets/index.js";
export { default as evalExtension } from "./eval/index.js";
export { default as taskManagementExtension } from "./task-management/index.js";
export { default as timerExtension } from "./timer/index.js";
export { default as toolLoopGuardExtension } from "./tool-loop-guard/index.js";
export { default as projectServicesExtension } from "./service/index.js";
export { default as serviceExtension } from "./service/index.js";
export { default as gitExtension } from "./git/index.js";
export { default as supervisorAdminExtension } from "./supervisor-admin/index.js";
export * as shadowExtension from "./shadow/index.js";
export {
  BUILTIN_EXTENSIONS,
  BUILTIN_EXTENSION_SLUGS,
  builtinExtensionSourcePath,
  isBuiltinExtensionResource,
  type BuiltinExtensionSpec,
} from "./catalog.js";
export {
  ensureAgentBuiltinExtensionBindings,
  ensureBuiltinExtensionResources,
  listEnabledBuiltinExtensionSlugs,
} from "./ensure.js";
