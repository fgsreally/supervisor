export { default as mcpPlugin } from "./mcp/index.js";
export { default as subagentPlugin } from "./subagent/index.js";
export { createSkillPlugin } from "./skill/index.js";
export { default as messageAssetsPlugin } from "./message-assets/index.js";
export { default as evalPlugin } from "./eval/index.js";
export { default as taskManagementPlugin } from "./task-management/index.js";
export { default as timerPlugin } from "./timer/index.js";
export { default as toolLoopGuardPlugin } from "./tool-loop-guard/index.js";
export { default as projectServicesPlugin } from "./service/index.js";
export { default as servicePlugin } from "./service/index.js";
export { default as gitPlugin } from "./git/index.js";
export { default as wecodeAdminPlugin } from "./wecode-admin/index.js";
export * as shadowPlugin from "./shadow/index.js";
export {
  BUILTIN_PLUGINS,
  BUILTIN_PLUGIN_SLUGS,
  builtinPluginSourcePath,
  isBuiltinPluginResource,
  type BuiltinPluginSpec,
} from "./catalog.js";
export {
  ensureAgentBuiltinPluginBindings,
  ensureBuiltinPluginResources,
  listEnabledBuiltinPluginSlugs,
} from "./ensure.js";
