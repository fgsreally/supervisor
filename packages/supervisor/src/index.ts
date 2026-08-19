import { getDefaultCwd, setDefaultCwd, resolveWorkspacePath } from "./config/default-cwd.js";
import { resolveDbPath } from "./config/resolve-db-path.js";
import { SupervisorDb } from "./db/db.js";
import { createHttpServer } from "./http/http-server.js";
import { SessionManager } from "./core/session/session-manager.js";
import { attachPushDispatcher } from "./core/push/push-dispatcher.js";
import { startDailyWorkScheduler } from "./core/tasks/daily-work.js";
import { registerWebSocketRoutes } from "./websocket/server.js";

export interface SupervisorOptions {
  port?: number;
  /** @deprecated Prefer `.supervisor/config.json` or settings `dbPath`. */
  dbPath?: string;
  cwd?: string;
}

export function startSupervisor(options: SupervisorOptions = {}): {
  manager: SessionManager;
  stop: () => Promise<void>;
} {
  if (options.cwd) setDefaultCwd(resolveWorkspacePath(options.cwd));
  const db = new SupervisorDb(resolveDbPath(options.dbPath));
  const manager = new SessionManager(db);
  attachPushDispatcher(db, (listener) => manager.onAnySessionOutput(listener));
  manager.createProject({ cwd: getDefaultCwd() });
  const app = createHttpServer(manager);
  const port = options.port ?? 3030;
  registerWebSocketRoutes(app, undefined, manager);
  app.listen({ hostname: "0.0.0.0", port });
  manager.resumePersistedSessionInputs();
  const stopDailyWork = startDailyWorkScheduler(db);
  return {
    manager,
    stop: async () => {
      stopDailyWork();
      await app.stop();
      await manager.dispose();
    },
  };
}

export { ensureAgentHome, getAgentHomeDir, getSupervisorAgentsRoot } from "./core/agent/index.js";
export type { AgentResources, AgentToolInfo, ResourceLayer } from "./core/agent/index.js";
export { SupervisorDb } from "./db/db.js";
export { createDefaultTools } from "./core/tools/index.js";
export {
  activatePackagedTools,
  getPackagedToolDir,
  listPackagedToolIds,
} from "./core/tools/index.js";
export {
  defineAgentExtension,
  defineExtension,
  Type,
  type Static,
  type TSchema,
} from "./core/extensions/index.js";
export { loadExtension, loadExtensions } from "./core/extensions/index.js";
export type {
  ExtensionContext,
  AgentExtensionContext,
  AgentExtensionDefinition,
  AgentExtensionAgent,
  ExtensionSession,
  SessionSetupReason,
  ExtensionEvent,
  ExtensionJobFacade,
  MessageEntry,
  SpawnSessionRequest,
  SpawnSessionResult,
  SupervisorProjectFacade,
  SupervisorUiFacade,
  ToolDefinition,
} from "./core/extensions/index.js";
export { createHttpServer } from "./http/http-server.js";
export { registerWebSocketRoutes } from "./websocket/server.js";
export { extractMessageSearchFields } from "./db/message-search.js";
export { copyMessagesWithInheritance } from "./core/session/index.js";
export type { SessionOutputListener } from "./core/session/index.js";
export { SessionManager } from "./core/session/index.js";
export { JobManager } from "./core/jobs/jobs.js";
export type * from "./core/jobs/jobs.js";
export {
  ResourceManager,
  type BindResourceInput,
  type InstallAndBindInput,
  type InstallResourceInput,
  type InstallResourceResult,
  type ResourceManagerDeps,
} from "./core/resources/index.js";
export {
  indexResourceHandlers,
  type ResourceDescriptor,
  type ResourceHandler,
  type ResourceInstallOutput,
  type ResourceInstallRequest,
} from "./core/resources/index.js";
export {
  AgentResource,
  type AgentResourceCommandInfo,
  type AgentResourceCommandSource,
  type AgentResourceOptions,
} from "./core/agent/index.js";
export type { AgentResourceBinding, Resource, ResourceKind } from "./core/resources/index.js";
export type { SessionEvent, SessionState } from "./core/session/index.js";
export { SessionRuntime } from "./core/session/index.js";
export { formatSkillsForPrompt, loadSkills, loadSkillsFromDir } from "./core/agent/index.js";
export type { TurnFileChanges, TurnRecord } from "./core/session/turn-file-tracker.js";
export type * from "./types.js";
