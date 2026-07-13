export {
  initializeResourceCatalog,
  migrateAgentHomeSymlinksToDb,
  syncGlobalCatalogToDb,
} from "./catalog-sync.js";
export { ExtensionModuleRegistry, type LoadedExtensionModule } from "./extension-registry.js";
export {
  ResourceService,
  parseBindResourceBody,
  parseInstallResourceBody,
  type BindResourceInput,
  type InstallAndBindInput,
  type InstallResourceInput,
  type InstallResourceResult,
  type InstallableResourceKind,
  type ResourceServiceDeps,
  type UnbindResourceInput,
} from "./resource-service.js";
export {
  AgentResource,
  type AgentResourceCommandInfo,
  type AgentResourceCommandSource,
  type AgentResourceOptions,
} from "./agent-resource.js";
export {
  listAgentResourcePathsFromSqlite,
  listAgentToolSlugsFromSqlite,
} from "./sqlite-bindings.js";
export {
  RESOURCE_KINDS,
  isResourceKind,
  type AgentResourceBinding,
  type AgentResourceRow,
  type Resource,
  type ResourceKind,
  type ResourceRow,
} from "./types.js";
