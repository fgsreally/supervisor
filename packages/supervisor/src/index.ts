import { serve } from "@hono/node-server";
import { getDefaultCwd, setDefaultCwd, resolveWorkspacePath } from "./config/default-cwd.js";
import { SupervisorDb } from "./db/db.js";
import { createHttpServer } from "./http/http-server.js";
import { SessionManager } from "./core/session-manager.js";

export interface SupervisorOptions {
  port?: number;
  dbPath?: string;
  cwd?: string;
}

export function startSupervisor(options: SupervisorOptions = {}): {
  manager: SessionManager;
  stop: () => Promise<void>;
} {
  if (options.cwd) setDefaultCwd(resolveWorkspacePath(options.cwd));
  const db = new SupervisorDb(options.dbPath);
  const manager = new SessionManager(db);
  manager.createProject({ cwd: getDefaultCwd() });
  const app = createHttpServer(manager);
  const port = options.port ?? 3030;
  const server = serve({ fetch: app.fetch, port });
  return {
    manager,
    stop: async () => {
      server.close();
      await manager.dispose();
    },
  };
}

export { ensureAgentHome, getAgentHomeDir, getSupervisorAgentsRoot } from "./agent/agent-paths.js";
export type { AgentResources, AgentToolInfo, ResourceLayer } from "./resources/agent-resources.js";
export {
  loadAgentSessionResources,
  resolveAgentResources,
  resolveAgentTools,
} from "./resources/agent-resources.js";
export { SupervisorDb } from "./db/db.js";
export { createDefaultTools } from "./utils/default-tools.js";
export { activatePackagedTools, getPackagedToolDir, listPackagedToolIds } from "./tools/index.js";
export { defineExtension } from "./extension-system/define-extension.js";
export { Type, type Static, type TSchema } from "./extension-system/schema.js";
export { Extension } from "./extension-system/extension.js";
export type { AgentExtensionModule } from "./extension-system/extension.js";
export { loadExtension, loadExtensions } from "./extension-system/loader.js";
export type {
  ExtensionContext,
  SpawnSessionRequest,
  SpawnSessionResult,
  SupervisorProjectFacade,
  SupervisorUiFacade,
  ToolDefinition,
} from "./extension-system/types.js";
export { createHttpServer } from "./http/http-server.js";
export { extractMessageSearchFields } from "./db/message-search.js";
export { copyMessagesWithInheritance } from "./core/session-branch.js";
export type { SessionOutputListener } from "./core/session-manager.js";
export { SessionManager } from "./core/session-manager.js";
export {
  Context,
  ContextAgent,
  ContextDb,
  ContextSession,
  type ContextDependencies,
} from "./core/context.js";
export {
  ResourceManager,
  type BindResourceInput,
  type InstallAndBindInput,
  type InstallResourceInput,
  type InstallResourceResult,
  type ResourceManagerDeps,
} from "./resources/resource-manager.js";
export {
  AgentResource,
  type AgentResourceCommandInfo,
  type AgentResourceCommandSource,
  type AgentResourceOptions,
} from "./resources/agent-resource.js";
export type { AgentResourceBinding, Resource, ResourceKind } from "./resources/types.js";
export type { SupervisorSessionEvent, SupervisorSessionState } from "./core/session-runtime.js";
export { SupervisorSessionRuntime } from "./core/session-runtime.js";
export { formatSkillsForPrompt, loadSkills, loadSkillsFromDir } from "./resources/skills.js";
export type { SessionSpawner } from "./spawn/session-spawner.js";
export type {
  SpawnAgentRequest,
  SpawnAgentResult,
  SpawnAgentToolContext,
} from "./spawn/spawn-agent-tool-provider.js";
export { SpawnAgentToolProvider } from "./spawn/spawn-agent-tool-provider.js";
export type { TurnFileChanges, TurnRecord } from "./git/turn-file-tracker.js";
export type * from "./types.js";
