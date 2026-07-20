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

export { ensureAgentHome, getAgentHomeDir, getSupervisorAgentsRoot } from "./agent/index.js";
export type { AgentResources, AgentToolInfo, ResourceLayer } from "./agent/resource-resolver.js";
export { SupervisorDb } from "./db/db.js";
export { createDefaultTools } from "./utils/default-tools.js";
export { activatePackagedTools, getPackagedToolDir, listPackagedToolIds } from "./tools/index.js";
export { defineExtension, Type, type Static, type TSchema } from "./extension/index.js";
export { loadExtension, loadExtensions } from "./extension/index.js";
export type {
  ExtensionContext,
  ExtensionEvent,
  SpawnSessionRequest,
  SpawnSessionResult,
  SupervisorProjectFacade,
  SupervisorUiFacade,
  ToolDefinition,
} from "./extension/index.js";
export { createHttpServer } from "./http/http-server.js";
export { extractMessageSearchFields } from "./db/message-search.js";
export { copyMessagesWithInheritance } from "./core/session-history.js";
export type { SessionOutputListener } from "./core/session-manager.js";
export { SessionManager } from "./core/session-manager.js";
export {
  ResourceManager,
  type BindResourceInput,
  type InstallAndBindInput,
  type InstallResourceInput,
  type InstallResourceResult,
  type ResourceManagerDeps,
} from "./resources/resource-manager.js";
export {
  indexResourceHandlers,
  type ResourceDescriptor,
  type ResourceHandler,
  type ResourceInstallOutput,
  type ResourceInstallRequest,
} from "./resources/handler.js";
export {
  AgentResource,
  type AgentResourceCommandInfo,
  type AgentResourceCommandSource,
  type AgentResourceOptions,
} from "./agent/runtime-resources.js";
export type { AgentResourceBinding, Resource, ResourceKind } from "./resources/types.js";
export type { SessionEvent, SessionState } from "./core/session-runtime.js";
export { SessionRuntime } from "./core/session-runtime.js";
export { formatSkillsForPrompt, loadSkills, loadSkillsFromDir } from "./agent/skills.js";
export type { TurnFileChanges, TurnRecord } from "./core/turn-file-tracker.js";
export type * from "./types.js";
