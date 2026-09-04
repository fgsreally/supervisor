import { getDefaultCwd, setDefaultCwd, resolveWorkspacePath } from "./config/default-cwd.js";
import { resolveDbPath } from "./config/resolve-db-path.js";
import { WecodeDb } from "./db/db.js";
import { createHttpServer } from "./http/http-server.js";
import { SessionManager } from "./core/session/session-manager.js";
import { attachPushDispatcher } from "./core/push/push-dispatcher.js";
import { startDailyWorkScheduler } from "./core/tasks/daily-work.js";
import { registerWebSocketRoutes } from "./websocket/server.js";

export interface WecodeOptions {
  port?: number;
  /** @deprecated Prefer `.wecode/config.json` or settings `dbPath`. */
  dbPath?: string;
  cwd?: string;
}

export function startWecode(options: WecodeOptions = {}): {
  manager: SessionManager;
  stop: () => Promise<void>;
} {
  if (options.cwd) setDefaultCwd(resolveWorkspacePath(options.cwd));
  const db = new WecodeDb(resolveDbPath(options.dbPath));
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

export { ensureAgentHome, getAgentHomeDir, getWecodeAgentsRoot } from "./core/agent/index.js";
export type { AgentResources, AgentToolInfo, ResourceLayer } from "./core/agent/index.js";
export { WecodeDb } from "./db/db.js";
export { createDefaultTools } from "./core/tools/index.js";
export {
  activatePackagedTools,
  getPackagedToolDir,
  listPackagedToolIds,
} from "./core/tools/index.js";
export {
  defineAgentPlugin,
  definePlugin,
  Type,
  type Static,
  type TSchema,
} from "./core/plugins/index.js";
export { loadPlugin, loadPlugins } from "./core/plugins/index.js";
export type {
  PluginContext,
  AgentPluginContext,
  AgentPluginDefinition,
  AgentPluginAgent,
  PluginSession,
  SessionSetupReason,
  PluginEvent,
  PluginJobFacade,
  MessageEntry,
  SpawnSessionRequest,
  SpawnSessionResult,
  WecodeProjectFacade,
  WecodeUiFacade,
  ToolDefinition,
} from "./core/plugins/index.js";
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
