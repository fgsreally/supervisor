import { randomUUID } from "node:crypto";
import type {
  AgentHarnessEvent,
  AgentMessage,
  AgentTool,
  SessionTreeEntry,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ImageContent, Model, StopReason } from "@earendil-works/pi-ai";
import type { SupervisorDb } from "../../db/db.js";
import type { SessionExtensionHost } from "../../extension/runtime/index.js";
import type { Agent, Session } from "../../types.js";
import type { ManagedSessionRuntime } from "../managed-session-runtime.js";
import type { ExternalInteractionResponse } from "../managed-session-runtime.js";
import type { SessionState, SlashCommandInfo } from "../session-runtime.js";
import { resolveSessionPromptImages, type SessionPromptImage } from "../session-media.js";
import { SQLiteSessionStorage } from "../session-storage.js";
import { appendLlmErrorMessage } from "../session-llm-error.js";
import { beginSessionTiming, timedSessionStep } from "../../utils/session-timing.js";
import { ExternalTurnBuffer } from "./external-turn-buffer.js";

type Listener = (event: AgentHarnessEvent) => void | Promise<void>;

export function createExternalAssistantMessage(
  text: string,
  stopReason: StopReason = "stop",
  errorMessage?: string,
): AssistantMessage {
  return {
    role: "assistant",
    content: text ? [{ type: "text", text }] : [],
    api: "external",
    provider: "external",
    model: "external",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    ...(errorMessage ? { errorMessage } : {}),
    timestamp: Date.now(),
  };
}

export abstract class ExternalSessionRuntime implements ManagedSessionRuntime {
  readonly id: number;
  readonly extension: SessionExtensionHost | null = null;

  protected readonly db: SupervisorDb;
  protected readonly session: Session;
  protected readonly agent: Agent;
  protected readonly storage: SQLiteSessionStorage;
  protected assistantText = "";
  private readonly turnBuffer = new ExternalTurnBuffer();

  private readonly listeners = new Set<Listener>();
  private readonly activeTools = new Map<string, { name: string; ended: boolean }>();
  private running: Promise<void> | null = null;

  protected constructor(options: { db: SupervisorDb; session: Session; agent: Agent }) {
    this.id = options.session.id;
    this.db = options.db;
    this.session = options.session;
    this.agent = options.agent;
    this.storage = new SQLiteSessionStorage(options.db, options.session.id);
  }

  protected abstract runExternalTurn(message: string, images?: ImageContent[]): Promise<void>;
  protected abstract interruptExternal(): Promise<void>;
  protected abstract disposeExternal(): Promise<void>;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected async emit(event: AgentHarnessEvent): Promise<void> {
    for (const listener of this.listeners) await listener(event);
  }

  protected setExternalSessionId(value: string): void {
    this.db.updateSessionFields(this.id, { externalSessionId: value });
  }

  protected async appendText(delta: string): Promise<void> {
    if (!delta) return;
    this.assistantText += delta;
    this.turnBuffer.appendText(delta);
    await this.emit({
      type: "message_update",
      message: createExternalAssistantMessage(this.assistantText),
      assistantMessageEvent: { type: "text_delta", delta },
    } as AgentHarnessEvent);
  }

  protected async appendThinking(delta: string): Promise<void> {
    if (!delta) return;
    this.turnBuffer.appendThinking(delta);
    await this.emit({
      type: "message_update",
      message: createExternalAssistantMessage(this.assistantText),
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta },
    } as AgentHarnessEvent);
  }

  protected async startTool(id: string, name: string, args: unknown): Promise<void> {
    if (this.activeTools.has(id)) return;
    this.activeTools.set(id, { name, ended: false });
    this.turnBuffer.recordToolStart(id, name, args);
    await this.emit({
      type: "tool_execution_start",
      toolCallId: id,
      toolName: name,
      args: args ?? {},
    });
  }

  /** Codex may emit turn/completed before the last item/completed notification is handled. */
  private async waitForActiveToolsIdle(timeoutMs = 5000): Promise<void> {
    const started = Date.now();
    while (this.activeTools.size > 0) {
      if (Date.now() - started >= timeoutMs) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  protected async endTool(id: string, result: unknown, isError = false): Promise<void> {
    const tool = this.activeTools.get(id);
    if (!tool || tool.ended) return;
    tool.ended = true;
    this.activeTools.delete(id);
    this.turnBuffer.recordToolEnd(id, tool.name, result, isError);
    await this.emit({
      type: "tool_execution_end",
      toolCallId: id,
      toolName: tool.name,
      result,
      isError,
    });
  }

  async prompt(
    message: string,
    images?: SessionPromptImage[],
    source?: string | null,
  ): Promise<void> {
    if (this.running) throw new Error(`Session ${this.id} is already running`);
    const work = this.runPrompt(message, images, source);
    this.running = work;
    try {
      await work;
    } finally {
      this.running = null;
    }
  }

  private async runPrompt(
    message: string,
    images?: SessionPromptImage[],
    source?: string | null,
  ): Promise<void> {
    const doneRun = beginSessionTiming(this.id, "external/runPrompt");
    try {
      const isFirstDelegatedTurn =
        this.session.spawnType === "subagent" &&
        !(await this.storage.getEntries()).some(
          (entry) => entry.type === "message" && entry.message?.role === "user",
        );
      const imageContent = images?.length
        ? await timedSessionStep(this.id, "resolvePromptImages", () =>
            resolveSessionPromptImages(this.id, images),
          )
        : undefined;
      // Retry / queue-drain after a killed turn often re-prompts the same text.
      // Reuse the existing leaf user message so the timeline doesn't duplicate.
      let userId = await this.findReusableUserLeafId(message);
      if (!userId) {
        userId = randomUUID();
        const contentParts: Array<Record<string, unknown>> = [{ type: "text", text: message }];
        if (images?.length) {
          for (const image of images) {
            contentParts.push({
              type: "image",
              name: image.name ?? "[Image]",
              mediaId: image.mediaId,
              mimeType: image.mimeType,
            });
          }
        }
        await this.storage.appendEntry(
          {
            id: userId,
            parentId: await this.storage.getLeafId(),
            timestamp: new Date().toISOString(),
            type: "message",
            message: {
              role: "user",
              content: contentParts,
              timestamp: Date.now(),
            },
          } as unknown as SessionTreeEntry,
          { source },
        );
      }
      this.assistantText = "";
      this.activeTools.clear();
      this.turnBuffer.reset();
      await this.emit({ type: "agent_start" });
      await this.emit({ type: "message_start", message: createExternalAssistantMessage("") });
      try {
        const sideQuestionPrompt =
          this.session.spawnType === "btw" && this.session.systemPrompt
            ? this.session.systemPrompt
            : "";
        const regularMessage = sideQuestionPrompt
          ? `${sideQuestionPrompt}\n\nSide question from the user:\n${message}`
          : message;
        const externalMessage = isFirstDelegatedTurn
          ? [
              "You are running as a delegated subagent. Work independently on the task below.",
              "Your final response will be returned to the parent agent, so report the concrete result, relevant changes, and any blocker clearly.",
              this.session.systemPrompt
                ? `Additional instructions from the parent:\n${this.session.systemPrompt}`
                : "",
              `Delegated task:\n${regularMessage}`,
            ]
              .filter(Boolean)
              .join("\n\n")
          : regularMessage;
        await this.runExternalTurn(externalMessage, imageContent);
        await this.waitForActiveToolsIdle();
        await this.turnBuffer.persist(this.storage, userId);
        const assistantMessage = createExternalAssistantMessage(this.assistantText);
        await this.emit({ type: "message_end", message: assistantMessage });
        await this.emit({ type: "agent_end", messages: [assistantMessage] });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        // Persist immediately so the UI can reload an llm_error card even if the
        // SSE client disconnects before SessionManager finishes bookkeeping.
        await appendLlmErrorMessage(this.storage, detail).catch(() => {});
        await this.emit({
          type: "agent_end",
          messages: [
            createExternalAssistantMessage("", "error", detail),
          ],
        });
        throw error;
      }
    } finally {
      doneRun();
    }
  }

  /** If the leaf is already this user text (failed/retried turn), reuse it. */
  private async findReusableUserLeafId(message: string): Promise<string | null> {
    const leafId = await this.storage.getLeafId();
    if (!leafId) return null;
    const entry = await this.storage.getEntry(leafId);
    if (!entry || entry.type !== "message" || entry.message?.role !== "user") return null;
    return userMessageText(entry.message) === message ? leafId : null;
  }

  steer(message: string, images?: SessionPromptImage[]): void {
    void (async () => {
      if (this.running) {
        await this.interruptExternal();
        await this.running.catch(() => {});
      }
      await this.prompt(message, images);
    })();
  }

  followUp(message: string, source?: string | null, images?: SessionPromptImage[]): void {
    void (async () => {
      await this.running?.catch(() => {});
      await this.prompt(message, images, source);
    })();
  }

  async abort(): Promise<void> {
    await this.interruptExternal();
  }

  async waitForIdle(): Promise<void> {
    await this.running;
  }

  async clear(): Promise<void> {
    await this.interruptExternal().catch(() => {});
    await this.disposeExternal();
  }

  async compact(): Promise<never> {
    throw new Error(`Compaction is managed by ${this.agent.name}`);
  }

  async reloadMessagesFromSessionTree(): Promise<void> {}

  async setModel(_provider: string, _modelId: string): Promise<Model<any>> {
    throw new Error(`Model selection is managed by ${this.agent.name}`);
  }

  async setThinkingLevel(_level: ThinkingLevel): Promise<void> {}
  async setActiveTools(_toolNames: string[]): Promise<void> {}
  async setTools(_tools: AgentTool[], _activeToolNames?: string[]): Promise<void> {}

  async getMessages(): Promise<SessionTreeEntry[]> {
    return this.storage.getEntries();
  }

  async getState(): Promise<SessionState> {
    const session = this.db.get(this.id);
    if (!session) throw new Error(`Session ${this.id} not found`);
    const messages = await this.storage.getEntries();
    const streamingReply = this.assistantText.trim();
    return {
      id: this.id,
      sessionId: session.external_session_id ?? null,
      cwd: session.cwd,
      status: session.status,
      model: { provider: this.agent.backendType, modelId: this.agent.name },
      thinkingLevel: session.thinking_level === "none" ? "off" : session.thinking_level,
      isStreaming: this.running !== null,
      messageCount: messages.filter((entry) => entry.type === "message").length,
      leafId: session.leaf_id,
      ...(streamingReply ? { streamingReply: this.assistantText } : {}),
    };
  }

  getSlashCommands(): SlashCommandInfo[] {
    return [];
  }

  getLastAssistantText(): string | undefined {
    return this.assistantText || undefined;
  }

  async deactivateExtension(_extensionId: string): Promise<boolean> {
    return false;
  }

  resolveExternalInteraction(
    _interactionId: string,
    _response: ExternalInteractionResponse,
  ): boolean {
    return false;
  }
}

function userMessageText(message: { content?: unknown } | undefined): string {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if ((part as { type?: string }).type === "text") {
        return typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "";
      }
      return "";
    })
    .join("");
}
