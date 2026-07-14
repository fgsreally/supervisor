/**
 * Supervisor Extension System
 *
 * 全新的扩展系统设计，面向 HTTP/多会话架构
 */

// Core
export { defineExtension } from "./define-extension.js";
export { Extension, type AgentExtensionModule } from "./extension.js";
export { Type, type Static, type TSchema } from "./schema.js";

// Loader
export {
  listExtensionInfosInDirectories,
  loadExtension,
  loadExtensionModule,
  loadExtensions,
  resolveExtensionEntries,
} from "./loader.js";
export type { ExtensionEntryInfo } from "./loader.js";
export { createExtensionDatabase } from "./extension-deps.js";
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
  SupervisorProjectFacade,
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
