/**
 * Supervisor Extension System
 *
 * 全新的扩展系统设计，面向 HTTP/多会话架构
 */

// Core
export { defineExtension, defineExtensionAsync } from "./define-extension.js";
export { Extension, type AgentExtensionModule } from "./extension.js";

// Loader
export {
  collectExtensionPaths,
  discoverAndLoadExtensions,
  discoverExtensionsInDir,
  filterExtensionInfosByDir,
  getExtensionDirectories,
  getPackagedExtensionPath,
  getPackagedExtensionsDir,
  getSupervisorAgentToolsExtensionPath,
  listExtensionInfosInDirectories,
  listExtensionsInDirectories,
  listPackagedExtensionPaths,
  loadExtension,
  loadExtensions,
  resolveExtensionEntries,
} from "./loader.js";
export type { ExtensionEntryInfo } from "./loader.js";
export { createExtensionDatabase } from "./runtime.js";
export { ToolPolicy, matchGlob, extractFilePaths, isWriteTool } from "./tool-policy.js";
export { submitApprovalResolution, cancelPendingApprovals } from "./extension-session-services.js";
export type {
  ApprovalRequest,
  ApprovalResult,
  ContinueTurnOptions,
  ContinueTurnResult,
  ScheduleInjectionInput,
  ToolGuardHandler,
  ToolResultHandler,
  TurnFlowLock,
  TurnUsage,
} from "./extension-session-services.js";

// Types
export type {
  BroadcastEvent,
  EventBus,
  EventHandlerContext,
  // Utils
  ExecResult,
  ExtensionInstance,
  // Context
  ExtensionContext,
  ExtensionDatabase,
  // Core
  ExtensionDefinition,
  // Events
  ExtensionEvent,
  ExtensionFactory,
  ExtensionRegistry,
  // Loader
  LoadExtensionResult,
  LoadExtensionsResult,
  LoadedExtension,
  MessageContent,
  MessageEntry,
  MessageNode,
  // Runtime
  RuntimeOptions,
  SearchResult,
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
  SupervisorSessionToolSetFacade,
  SupervisorSystemFacade,
  SupervisorToolRegistryFacade,
  SupervisorUiFacade,
  TurnFlowFacade,
  TurnInjectorFacade,
  // Session & Messages
  SessionInfo,
  // Tools
  ToolDefinition,
  ToolExecutionContext,
  ToolInfo,
} from "./types.js";
