import type {
  AgentHarnessEvent,
  AgentTool,
  SessionTreeEntry,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { ImageContent, Model } from "@earendil-works/pi-ai";
import type { SessionExtensionHost } from "../extension/runtime/index.js";
import type { SessionState, SlashCommandInfo } from "./session-runtime.js";

export interface ManagedSessionRuntime {
  readonly id: number;
  readonly extension: SessionExtensionHost | null;
  subscribe(listener: (event: AgentHarnessEvent) => void | Promise<void>): () => void;
  clear(): Promise<void>;
  prompt(message: string, images?: ImageContent[], source?: string | null): Promise<void>;
  steer(message: string, images?: ImageContent[]): void | Promise<void>;
  followUp(message: string, source?: string | null, images?: ImageContent[]): void;
  abort(): Promise<void>;
  waitForIdle(): Promise<void>;
  compact(customInstructions?: string): Promise<{
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    details?: unknown;
  }>;
  reloadMessagesFromSessionTree(): Promise<void>;
  setModel(provider: string, modelId: string): Promise<Model<any>>;
  setThinkingLevel(level: ThinkingLevel): Promise<void>;
  setActiveTools(toolNames: string[]): Promise<void>;
  setTools(tools: AgentTool[], activeToolNames?: string[]): Promise<void>;
  getMessages(): Promise<SessionTreeEntry[]>;
  getState(): Promise<SessionState>;
  getSlashCommands(): SlashCommandInfo[];
  executeSlashCommand?(name: string, args: string): Promise<void>;
  getLastAssistantText(): string | undefined;
  deactivateExtension(extensionId: string): Promise<boolean>;
  resolveExternalInteraction?(
    interactionId: string,
    response: ExternalInteractionResponse,
  ): boolean;
  requestExternalInteraction?(
    request: ExternalInteractionRequest,
  ): Promise<ExternalInteractionResponse>;
}

export interface ExternalInteractionRequest {
  backend: string;
  kind: "approval" | "question";
  title: string;
  detail?: string;
  request?: unknown;
  questions?: unknown[];
  options?: unknown[];
}

export interface ExternalInteractionResponse {
  action: "approve" | "approve_session" | "deny" | "cancel" | "answer";
  answers?: Record<string, string[]>;
  optionId?: string;
}
