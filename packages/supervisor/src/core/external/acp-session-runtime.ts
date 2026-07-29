import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  ndJsonStream,
  type Client,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type ToolCall,
  type ToolCallUpdate,
} from "@agentclientprotocol/sdk";
import type {
  AgentHarnessEvent,
  AgentMessage,
  AgentTool,
  SessionTreeEntry,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { Agent, Session } from "../../types.js";
import type { SupervisorDb } from "../../db/db.js";
import type { SessionExtensionHost } from "../../extension/runtime/index.js";
import type { ManagedSessionRuntime } from "../managed-session-runtime.js";
import type { ExternalInteractionResponse } from "../managed-session-runtime.js";
import type { SessionState, SlashCommandInfo } from "../session-runtime.js";
import { resolveSessionPromptImages, type SessionPromptImage } from "../session-media.js";
import { SQLiteSessionStorage } from "../session-storage.js";
import { getExternalAgentConfig } from "./external-agent-config.js";
import { sessionServicePortEnv } from "../session-services.js";
import { ExternalTurnBuffer } from "./external-turn-buffer.js";

export interface AcpAgentConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  permissionPolicy?: "allow_once" | "reject_once";
}

type Listener = (event: AgentHarnessEvent) => void | Promise<void>;

function parseAcpConfig(agent: Agent): AcpAgentConfig {
  const config = getExternalAgentConfig(agent);
  if (!config.command) throw new Error(`ACP agent ${agent.id} is missing meta.command`);
  return {
    command: config.command,
    args: config.args,
    env: config.env,
    permissionPolicy: agent.meta.permissionPolicy === "allow_once" ? "allow_once" : "reject_once",
  };
}

function toolResult(update: ToolCall | ToolCallUpdate): unknown {
  if (update.rawOutput !== undefined) return update.rawOutput;
  if (!update.content) return null;
  return update.content;
}

export class AcpSessionRuntime implements ManagedSessionRuntime {
  readonly id: number;
  readonly extension: SessionExtensionHost | null = null;

  private readonly db: SupervisorDb;
  private readonly session: Session;
  private readonly agent: Agent;
  private readonly storage: SQLiteSessionStorage;
  private readonly config: AcpAgentConfig;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly connection: ClientSideConnection;
  private readonly listeners = new Set<Listener>();
  private readonly tools = new Map<string, { name: string; args: unknown; ended: boolean }>();
  private backendSessionId = "";
  private assistantText = "";
  private readonly turnBuffer = new ExternalTurnBuffer();
  private running: Promise<void> | null = null;
  private readonly interactions = new Map<
    string,
    {
      request: RequestPermissionRequest;
      resolve: (response: RequestPermissionResponse) => void;
    }
  >();

  private constructor(options: {
    db: SupervisorDb;
    session: Session;
    agent: Agent;
    child: ChildProcessWithoutNullStreams;
    connection: ClientSideConnection;
  }) {
    this.id = options.session.id;
    this.db = options.db;
    this.session = options.session;
    this.agent = options.agent;
    this.storage = new SQLiteSessionStorage(options.db, options.session.id);
    this.config = parseAcpConfig(options.agent);
    this.child = options.child;
    this.connection = options.connection;
  }

  static async create(options: {
    db: SupervisorDb;
    session: Session;
    agent: Agent;
  }): Promise<AcpSessionRuntime> {
    const config = parseAcpConfig(options.agent);
    const portEnv = sessionServicePortEnv(options.session.meta);
    const child = spawn(config.command, config.args ?? [], {
      cwd: options.session.cwd,
      env: { ...process.env, ...config.env, ...portEnv },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let runtime: AcpSessionRuntime;
    const client: Client = {
      requestPermission: (request) => runtime.handlePermission(request),
      sessionUpdate: (notification) => runtime.handleUpdate(notification),
    };
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    );
    const connection = new ClientSideConnection(() => client, stream);
    runtime = new AcpSessionRuntime({ ...options, child, connection });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const message = chunk.trim();
      if (message) console.error(`[acp:${options.session.id}] ${message}`);
    });

    try {
      await Promise.race([
        connection.initialize({
          protocolVersion: 1,
          clientCapabilities: {},
          clientInfo: { name: "pi-supervisor", version: "0.1.0" },
        }),
        new Promise<never>((_resolve, reject) => {
          child.once("error", reject);
        }),
      ]);
      const savedId = options.session.externalSessionId;
      if (typeof savedId === "string" && savedId.length > 0) {
        await connection.loadSession({
          sessionId: savedId,
          cwd: options.session.cwd,
          mcpServers: [],
        });
        runtime.backendSessionId = savedId;
      } else {
        const created = await connection.newSession({ cwd: options.session.cwd, mcpServers: [] });
        runtime.backendSessionId = created.sessionId;
        options.db.updateSessionFields(options.session.id, {
          externalSessionId: created.sessionId,
        });
      }
      return runtime;
    } catch (error) {
      child.kill();
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start ACP agent "${options.agent.name}": ${detail}`);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async emit(event: AgentHarnessEvent): Promise<void> {
    for (const listener of this.listeners) await listener(event);
  }

  private async handlePermission(
    request: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    const interactionId = `acp-${randomUUID()}`;
    await this.emit({
      type: "tool_execution_start",
      toolCallId: interactionId,
      toolName: "external_interaction",
      args: {
        externalInteraction: true,
        interactionId,
        backend: this.agent.backendType,
        kind: "approval",
        title: `${this.agent.name} 请求操作权限`,
        detail: request.toolCall?.title ?? "",
        options: request.options,
        request,
      },
    });
    return new Promise((resolve) => {
      this.interactions.set(interactionId, { request, resolve });
    });
  }

  resolveExternalInteraction(
    interactionId: string,
    response: ExternalInteractionResponse,
  ): boolean {
    const pending = this.interactions.get(interactionId);
    if (!pending) return false;
    this.interactions.delete(interactionId);
    const requestedKind = response.action.startsWith("approve") ? "allow" : "reject";
    const selected =
      pending.request.options.find((option) => option.optionId === response.optionId) ??
      pending.request.options.find((option) => option.kind.includes(requestedKind));
    pending.resolve(
      selected
        ? { outcome: { outcome: "selected", optionId: selected.optionId } }
        : { outcome: { outcome: "cancelled" } },
    );
    void this.emit({
      type: "tool_execution_end",
      toolCallId: interactionId,
      toolName: "external_interaction",
      result: { action: response.action },
      isError: response.action === "deny" || response.action === "cancel",
    });
    return true;
  }

  private async handleUpdate(notification: SessionNotification): Promise<void> {
    if (notification.sessionId !== this.backendSessionId && this.backendSessionId.length > 0)
      return;
    const update = notification.update;
    if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
      this.assistantText += update.content.text;
      this.turnBuffer.appendText(update.content.text);
      await this.emit({
        type: "message_update",
        message: { role: "assistant", content: this.assistantText } as AgentMessage,
        assistantMessageEvent: { type: "text_delta", delta: update.content.text },
      } as AgentHarnessEvent);
      return;
    }
    if (update.sessionUpdate === "agent_thought_chunk" && update.content.type === "text") {
      this.turnBuffer.appendThinking(update.content.text);
      await this.emit({
        type: "message_update",
        message: { role: "assistant", content: this.assistantText } as AgentMessage,
        assistantMessageEvent: {
          type: "thinking_delta",
          contentIndex: 0,
          delta: update.content.text,
        },
      } as AgentHarnessEvent);
      return;
    }
    if (update.sessionUpdate === "tool_call") {
      const record = { name: update.title, args: update.rawInput ?? {}, ended: false };
      this.tools.set(update.toolCallId, record);
      this.turnBuffer.recordToolStart(update.toolCallId, record.name, record.args);
      await this.emit({
        type: "tool_execution_start",
        toolCallId: update.toolCallId,
        toolName: record.name,
        args: record.args,
      });
      if (update.status === "completed" || update.status === "failed") {
        await this.endTool(update.toolCallId, update, update.status === "failed");
      }
      return;
    }
    if (update.sessionUpdate === "tool_call_update") {
      let record = this.tools.get(update.toolCallId);
      if (!record) {
        record = {
          name: update.title ?? "ACP tool",
          args: update.rawInput ?? {},
          ended: false,
        };
        this.tools.set(update.toolCallId, record);
        this.turnBuffer.recordToolStart(update.toolCallId, record.name, record.args);
        await this.emit({
          type: "tool_execution_start",
          toolCallId: update.toolCallId,
          toolName: record.name,
          args: record.args,
        });
      }
      if (update.status === "completed" || update.status === "failed") {
        await this.endTool(update.toolCallId, update, update.status === "failed");
      }
    }
  }

  private async waitForActiveToolsIdle(timeoutMs = 5000): Promise<void> {
    const started = Date.now();
    while (this.tools.size > 0) {
      if (Date.now() - started >= timeoutMs) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  private async endTool(
    toolCallId: string,
    update: ToolCall | ToolCallUpdate,
    isError: boolean,
  ): Promise<void> {
    const record = this.tools.get(toolCallId);
    if (!record || record.ended) return;
    record.ended = true;
    this.tools.delete(toolCallId);
    this.turnBuffer.recordToolEnd(toolCallId, record.name, toolResult(update), isError);
    await this.emit({
      type: "tool_execution_end",
      toolCallId,
      toolName: record.name,
      result: toolResult(update),
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
    const userId = randomUUID();
    const parentId = await this.storage.getLeafId();
    const imageContent = images?.length
      ? await resolveSessionPromptImages(this.id, images)
      : undefined;
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
        parentId,
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
    this.assistantText = "";
    this.tools.clear();
    this.turnBuffer.reset();
    await this.emit({ type: "agent_start" });
    await this.emit({ type: "message_start", message: { role: "assistant", content: "" } });
    try {
      await this.connection.prompt({
        sessionId: this.backendSessionId,
        messageId: userId,
        prompt: [
          { type: "text", text: message },
          ...(imageContent ?? []).map((image) => ({
            type: "image" as const,
            data: image.data,
            mimeType: image.mimeType,
          })),
        ],
      });
      await this.waitForActiveToolsIdle();
      const assistantMessage = {
        role: "assistant",
        content: this.assistantText,
        timestamp: Date.now(),
      } as AgentMessage;
      await this.turnBuffer.persist(this.storage, userId);
      await this.emit({ type: "message_end", message: assistantMessage });
      await this.emit({ type: "agent_end", messages: [assistantMessage] });
    } catch (error) {
      await this.emit({ type: "agent_end", messages: [] });
      throw error;
    }
  }

  steer(message: string): void {
    void (async () => {
      if (this.running) {
        await this.abort();
        await this.running.catch(() => {});
      }
      await this.prompt(message);
    })();
  }

  followUp(message: string, source?: string | null): void {
    void (async () => {
      await this.running?.catch(() => {});
      await this.prompt(message, undefined, source);
    })();
  }

  async abort(): Promise<void> {
    if (this.backendSessionId) await this.connection.cancel({ sessionId: this.backendSessionId });
  }

  async waitForIdle(): Promise<void> {
    await this.running;
  }

  async clear(): Promise<void> {
    await this.abort().catch(() => {});
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      this.child.once("exit", () => resolve());
      if (!this.child.kill()) resolve();
    });
  }

  async compact(): Promise<never> {
    throw new Error("Compaction is managed by the external ACP agent");
  }

  async reloadMessagesFromSessionTree(): Promise<void> {}

  async setModel(_provider: string, _modelId: string): Promise<Model<any>> {
    throw new Error("Model selection is managed by the external ACP agent");
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
      sessionId: session.external_session_id,
      cwd: session.cwd,
      status: session.status,
      model: { provider: "acp", modelId: this.agent.name },
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
}
