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

export {
  ensureAgentHome,
  getAgentHomeDir,
  getAgentResourceDirs,
  getProjectResourceDirs,
  getSupervisorAgentsRoot,
  installExtensionToAgentDir,
  removeExtensionFromAgentDir,
} from "./agent/agent-paths.js";
export type { AgentResources, AgentToolInfo, ResourceLayer } from "./agent/agent-resources.js";
export {
  listExtensionPathsFromDirs,
  loadAgentSessionResources,
  resolveAgentResources,
  resolveAgentTools,
} from "./agent/agent-resources.js";
export { SupervisorDb } from "./db/db.js";
export { createDefaultTools } from "./utils/default-tools.js";
export { defineExtension, defineExtensionAsync } from "./extension-system/define-extension.js";
export {
  discoverAndLoadExtensions,
  getPackagedExtensionPath,
  getPackagedExtensionsDir,
  getSupervisorAgentToolsExtensionPath,
  listPackagedExtensionPaths,
  loadExtension,
  loadExtensions,
} from "./extension-system/loader.js";
export type {
  ExtensionContext,
  ExtensionInstance,
  SpawnSessionRequest,
  SpawnSessionResult,
  SupervisorAgentFacade,
  SupervisorProjectFacade,
  SupervisorRuntimeFacade,
  SupervisorSessionFacade,
  SupervisorSessionMembersFacade,
  SupervisorSessionMessagesFacade,
  SupervisorSessionMetaFacade,
  SupervisorSessionRuntimeFacade,
  SupervisorSystemFacade,
  SupervisorToolRegistryFacade,
  SupervisorUiFacade,
  ToolDefinition,
} from "./extension-system/types.js";
export { createHttpServer } from "./http/http-server.js";
export { extractMessageSearchFields } from "./db/message-search.js";
export { copyMessagesWithInheritance } from "./core/session-branch.js";
export type { SessionOutputListener } from "./core/session-manager.js";
export { SessionManager } from "./core/session-manager.js";
export type { SupervisorSessionEvent, SupervisorSessionState } from "./core/session-runtime.js";
export { SupervisorSessionRuntime } from "./core/session-runtime.js";
export { formatSkillsForPrompt, loadSkills, loadSkillsFromDir } from "./agent/skills.js";
export type { SessionSpawner } from "./spawn/session-spawner.js";
export type {
  SpawnAgentRequest,
  SpawnAgentResult,
  SpawnAgentToolContext,
} from "./spawn/spawn-agent-tool-provider.js";
export { SpawnAgentToolProvider } from "./spawn/spawn-agent-tool-provider.js";
export type { TurnFileChanges, TurnRecord } from "./git/turn-file-tracker.js";
export type * from "./types.js";
