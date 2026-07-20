import { randomUUID } from "node:crypto";
import type {
  AgentHarnessEvent,
  AgentMessage,
  AgentTool,
  SessionTreeEntry,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { ImageContent, Model } from "@earendil-works/pi-ai";
import type { SupervisorDb } from "../../db/db.js";
import type { SessionExtensionHost } from "../../extension/runtime/index.js";
import type { Agent, Session } from "../../types.js";
import type { ManagedSessionRuntime } from "../managed-session-runtime.js";
import type { ExternalInteractionResponse } from "../managed-session-runtime.js";
import type { SessionState, SlashCommandInfo } from "../session-runtime.js";
import { SQLiteSessionStorage } from "../session-storage.js";

type Listener = (event: AgentHarnessEvent) => void | Promise<void>;

export abstract class ExternalSessionRuntime implements ManagedSessionRuntime {
  readonly id: number;
  readonly extension: SessionExtensionHost | null = null;

  protected readonly db: SupervisorDb;
  protected readonly session: Session;
  protected readonly agent: Agent;
  protected readonly storage: SQLiteSessionStorage;
  protected assistantText = "";

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
    this.db.updateMeta(this.id, { externalSessionId: value });
  }

  protected async appendText(delta: string): Promise<void> {
    if (!delta) return;
    this.assistantText += delta;
    await this.emit({
      type: "message_update",
      message: { role: "assistant", content: this.assistantText } as AgentMessage,
      assistantMessageEvent: { type: "text_delta", delta },
    } as AgentHarnessEvent);
  }

  protected async appendThinking(delta: string): Promise<void> {
    if (!delta) return;
    await this.emit({
      type: "message_update",
      message: { role: "assistant", content: this.assistantText } as AgentMessage,
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta },
    } as AgentHarnessEvent);
  }

  protected async startTool(id: string, name: string, args: unknown): Promise<void> {
    if (this.activeTools.has(id)) return;
    this.activeTools.set(id, { name, ended: false });
    await this.emit({
      type: "tool_execution_start",
      toolCallId: id,
      toolName: name,
      args: args ?? {},
    });
  }

  protected async endTool(id: string, result: unknown, isError = false): Promise<void> {
    const tool = this.activeTools.get(id);
    if (!tool || tool.ended) return;
    tool.ended = true;
    await this.emit({
      type: "tool_execution_end",
      toolCallId: id,
      toolName: tool.name,
      result,
      isError,
    });
  }

  async prompt(message: string, images?: ImageContent[], source?: string | null): Promise<void> {
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
    images?: ImageContent[],
    source?: string | null,
  ): Promise<void> {
    const userId = randomUUID();
    await this.storage.appendEntry(
      {
        id: userId,
        parentId: await this.storage.getLeafId(),
        timestamp: new Date().toISOString(),
        type: "message",
        message: { role: "user", content: message, timestamp: Date.now() },
      } as SessionTreeEntry,
      { source },
    );
    this.assistantText = "";
    this.activeTools.clear();
    await this.emit({ type: "agent_start" });
    await this.emit({ type: "message_start", message: { role: "assistant", content: "" } });
    try {
      const runtimeConfig = this.session.meta.runtimeConfig;
      const sideQuestionPrompt =
        this.session.branchType === "btw" &&
        runtimeConfig &&
        typeof runtimeConfig === "object" &&
        typeof (runtimeConfig as { systemPrompt?: unknown }).systemPrompt === "string"
          ? (runtimeConfig as { systemPrompt: string }).systemPrompt
          : "";
      const externalMessage = sideQuestionPrompt
        ? `${sideQuestionPrompt}\n\nSide question from the user:\n${message}`
        : message;
      await this.runExternalTurn(externalMessage, images);
      const assistantMessage = {
        role: "assistant",
        content: this.assistantText,
        timestamp: Date.now(),
      } as AgentMessage;
      await this.storage.appendEntry({
        id: randomUUID(),
        parentId: userId,
        timestamp: new Date().toISOString(),
        type: "message",
        message: assistantMessage,
      } as SessionTreeEntry);
      await this.emit({ type: "message_end", message: assistantMessage });
      await this.emit({ type: "agent_end", messages: [assistantMessage] });
    } catch (error) {
      await this.emit({ type: "agent_end", messages: [] });
      throw error;
    }
  }

  steer(message: string, images?: ImageContent[]): void {
    void (async () => {
      if (this.running) {
        await this.interruptExternal();
        await this.running.catch(() => {});
      }
      await this.prompt(message, images);
    })();
  }

  followUp(message: string, source?: string | null, images?: ImageContent[]): void {
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
    return {
      id: this.id,
      sessionId: session.session_id,
      cwd: session.cwd,
      status: session.status,
      model: { provider: this.agent.backendType, modelId: this.agent.name },
      thinkingLevel: session.thinking_level,
      isStreaming: this.running !== null,
      messageCount: messages.filter((entry) => entry.type === "message").length,
      leafId: session.leaf_id,
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
