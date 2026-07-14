import type {
  AgentHarness,
  AgentHarnessEvent,
  AgentMessage,
  AgentTool,
} from "@earendil-works/pi-agent-core";
import type { TSchema } from "typebox";
import type { LoadedExtensionModule } from "../../resources/extension-registry.js";
import type { Context } from "./context.js";
import { SessionExtensionRuntime } from "./runtime.js";
import type {
  EventHandlerContext,
  ExtensionDefinition,
  ExtensionEvent,
  ToolDefinition,
  ToolExecutionContext,
  ToolInfo,
  MessageContent,
} from "../../extension/index.js";

type AgentContentMessage = Extract<AgentMessage, { role: "user" | "assistant" }>;

/**
 * 当前 Session 的扩展宿主。
 *
 * Agent 运行期间只需要持有这个生命周期对象；扩展激活、事件分发、
 * 工具接入和资源清理都由它统一负责。
 */
export class SessionExtensionHost {
  /** 内部运行实现，保存扩展注册表和会话级服务。 */
  private readonly runtime: SessionExtensionRuntime;

  /** 已转换为扩展消息事件的 Harness 消息数量，用于避免重复分发。 */
  private emittedAgentMessageCount = 0;

  /** 解除当前 Extension 与 Agent Harness 钩子绑定的清理函数。 */
  private readonly harnessCleanups: Array<() => void> = [];

  /** 当前 Extension 所绑定的 Supervisor 会话 ID。 */
  readonly sessionId: number;

  /** 创建 Extension，并将它绑定到唯一的 Agent 会话。 */
  constructor(context: Context) {
    this.sessionId = context.session.id;
    this.runtime = new SessionExtensionRuntime(context);
  }

  /** Activate built-in extensions after the session Context is fully constructed. */
  async initialize(): Promise<void> {
    await this.runtime.loadBuiltinExtensions();
  }

  /** 合并 Harness 内置工具和扩展工具；同名时扩展工具覆盖内置工具。 */
  static mergeToolInfos(builtinTools: AgentTool[], extensionTools: ToolInfo[]): ToolInfo[] {
    const merged = new Map<string, ToolInfo>();
    for (const tool of builtinTools) {
      merged.set(tool.name, {
        name: tool.name,
        description: tool.description ?? tool.name,
        parameters: tool.parameters as TSchema,
        source: "builtin",
        definition: tool as unknown as ToolDefinition<TSchema, unknown>,
      });
    }
    for (const tool of extensionTools) merged.set(tool.name, tool);
    return [...merged.values()];
  }

  /** 当前会话独占的工具、上下文注入、Turn 流程和审批服务。 */
  get services(): SessionExtensionRuntime["services"] {
    return this.runtime.services;
  }

  /** 为当前 Agent 激活一个已经导入的扩展定义。 */
  async load(definition: ExtensionDefinition, path: string): Promise<void> {
    await this.runtime.loadExtension(definition, path);
  }

  /** 激活绑定到当前 Agent 的全部扩展模块，并返回模块目录中的错误。 */
  async loadModules(
    modules: LoadedExtensionModule[],
  ): Promise<Array<{ slug: string; error: string }>> {
    const errors: Array<{ slug: string; error: string }> = [];
    for (const module of modules) {
      if (module.error) {
        errors.push({ slug: module.slug, error: module.error });
        continue;
      }
      await this.load(module.definition, module.path);
    }
    return errors;
  }

  /** Deactivate one extension instance for this session and run its cleanup. */
  async unload(extensionId: string): Promise<boolean> {
    return this.runtime.unloadExtension(extensionId);
  }

  /** 为当前 Agent 注册一个带类型的扩展事件处理器。 */
  on<T extends ExtensionEvent>(
    type: T["type"],
    handler: (event: T, context: EventHandlerContext) => void | Promise<void>,
  ): () => void {
    return this.runtime.on("$runtime", type, handler);
  }

  /** 向当前 Agent 的所有扩展分发一个 Supervisor 扩展事件。 */
  async emit<T extends ExtensionEvent>(event: T): Promise<void> {
    await this.runtime.emit(event);
  }

  /** 将工具调用守卫和 Turn 边界注入接入 Agent Harness。 */
  bindHarness(harness: AgentHarness): void {
    this.harnessCleanups.push(
      harness.on("tool_call", async (event) => {
        const blocked = await this.checkToolBeforeCall(
          event.toolCallId,
          event.toolName,
          event.input,
        );
        return blocked.block ? { block: true, reason: blocked.reason } : undefined;
      }),
      harness.on("context", async (event) => {
        const messages = this.applyTurnInjections(event.messages);
        return messages === event.messages ? undefined : { messages };
      }),
    );
  }

  /** 把 Pi Agent Harness 事件转换并分发给当前 Agent 的扩展。 */
  async handleHarnessEvent(event: AgentHarnessEvent): Promise<void> {
    try {
      switch (event.type) {
        case "agent_start":
          await this.emit({
            type: "agent.start",
            messageId: "",
            entryId: "",
            timestamp: Date.now(),
          });
          return;
        case "turn_start": {
          const turnId = this.runtime.onTurnStarted();
          await this.emit({ type: "turn.started", turnId, timestamp: Date.now() });
          return;
        }
        case "turn_end": {
          const message = (event as { message?: { usage?: Record<string, number> } }).message;
          const usage = message?.usage as
            | { input?: number; output?: number; totalTokens?: number }
            | undefined;
          const turnId = this.runtime.onTurnEnded(usage);
          await this.emit({
            type: "turn.ended",
            turnId,
            reason: (event as { stopReason?: string }).stopReason,
            usage,
            timestamp: Date.now(),
          });
          return;
        }
        case "message_end": {
          const message = (event as { message?: { role?: string; usage?: Record<string, number> } })
            .message;
          if (message?.role === "assistant" && message.usage) {
            const usage = message.usage as {
              input?: number;
              output?: number;
              totalTokens?: number;
            };
            this.runtime.onStepEnded(usage);
            await this.emit({ type: "step.ended", turnId: 0, usage, timestamp: Date.now() });
          }
          return;
        }
        case "agent_end": {
          await this.emit({
            type: "agent.end",
            messageId: "",
            entryId: "",
            stopReason:
              (event as AgentHarnessEvent & { stopReason?: string }).stopReason ?? "end_turn",
            timestamp: Date.now(),
            messages: event.messages,
          });
          const mapped = this.mapHarnessEvent(event, {
            previousMessageCount: this.emittedAgentMessageCount,
          });
          this.emittedAgentMessageCount = Array.isArray(event.messages) ? event.messages.length : 0;
          for (const mappedEvent of mapped) await this.emit(mappedEvent);
          return;
        }
        case "abort":
          await this.emit({
            type: "agent.abort",
            reason: (event as { reason?: "user" | "timeout" | "error" }).reason ?? "user",
            timestamp: Date.now(),
          });
          return;
        default:
          for (const mappedEvent of this.mapHarnessEvent(event)) {
            await this.emit(mappedEvent);
          }
      }
    } catch {
      // 扩展可能仍在启动或已经停止，不能让扩展状态破坏 Agent 主流程。
    }
  }

  /** 将 Agent 错误通知扩展，但不把扩展异常抛回 Agent 主流程。 */
  forwardError(error: string, messageId?: string): void {
    void this.emit({
      type: "agent.error",
      error,
      messageId,
      timestamp: Date.now(),
    }).catch(() => {});
  }

  /** 将扩展注册的全部工具转换为 Pi Agent Harness 可执行工具。 */
  collectTools(): AgentTool[] {
    return (this.runtime.getAllTools() as ToolInfo[]).map((tool) => this.toAgentTool(tool));
  }

  /** 用当前 Agent 的扩展守卫和结果钩子包装普通 Agent 工具。 */
  wrapTools(tools: AgentTool[]): AgentTool[] {
    return tools.map((tool) => this.wrapTool(tool));
  }

  /** 按名称获取一个已经注册的扩展工具定义。 */
  getTool(name: string): ToolDefinition<TSchema, unknown> | undefined {
    return this.runtime.getTool(name);
  }

  /** 获取当前 Agent 扩展注册表中的全部工具元数据。 */
  getAllTools(): ToolInfo[] {
    return this.runtime.getAllTools();
  }

  /** 将一个 Supervisor 内置工具注册到当前 Agent 的扩展工具表。 */
  registerPackagedTool(packageId: string, tool: AgentTool, pausing?: { message: string }): void {
    this.runtime.registerPackagedTool(packageId, tool, pausing);
  }

  /** 记录内置工具激活失败，但不中断 Agent 启动。 */
  logPackagedToolWarning(toolId: string, error: unknown): void {
    this.runtime.logPackagedToolWarning(toolId, error);
  }

  /** 返回扩展工具执行时使用的会话身份和工作目录。 */
  getToolExecutionSession(): { id: string; cwd: string } {
    return this.runtime.getToolExecutionSession();
  }

  /** 执行当前 Agent 注册的一个扩展工具。 */
  async executeTool(
    name: string,
    params: unknown,
    context: ToolExecutionContext,
  ): Promise<{
    content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>;
    details?: unknown;
    isError?: boolean;
  }> {
    return this.runtime.executeTool(name, params, context);
  }

  /** 在工具调用前依次执行当前 Agent 的事件处理器、策略和守卫。 */
  async checkToolBeforeCall(
    toolCallId: string,
    name: string,
    args: unknown,
  ): Promise<{ block: boolean; reason?: string }> {
    return this.runtime.checkToolBeforeCall(toolCallId, name, args);
  }

  /** 在工具调用后执行当前 Agent 的结果转换处理器。 */
  async runToolAfterHandlers(
    toolCallId: string,
    name: string,
    args: unknown,
    result: unknown,
    setResult: (next: unknown) => void,
  ): Promise<void> {
    await this.runtime.runToolAfterHandlers(toolCallId, name, args, result, setResult);
  }

  /** 将计划中的扩展注入应用到下一次 Agent 上下文。 */
  applyTurnInjections(messages: AgentMessage[]): AgentMessage[] {
    return this.runtime.applyTurnInjections(messages);
  }

  /** 发送 session.end、执行全部清理函数并释放当前 Agent 的扩展状态。 */
  async clear(reason: "shutdown" | "switch" | "error" = "shutdown"): Promise<void> {
    try {
      await this.emit({ type: "session.end", reason, sessionId: this.sessionId });
      await this.runtime.unloadAll();
    } finally {
      for (const cleanup of this.harnessCleanups.splice(0)) cleanup();
      this.emittedAgentMessageCount = 0;
    }
  }

  /** 将扩展工具元数据转换为 Pi Agent Harness 可执行工具。 */
  private toAgentTool(info: ToolInfo): AgentTool {
    return {
      name: info.name,
      label: info.name,
      description: info.description,
      parameters: info.parameters,
      execute: async (toolCallId: string, params: unknown, signal?: AbortSignal) =>
        this.executeTool(info.name, params, {
          toolCallId,
          session: this.getToolExecutionSession(),
          signal,
          reportProgress: () => {},
        }),
    };
  }

  /** 为普通 Agent 工具添加扩展前置守卫和后置结果处理。 */
  private wrapTool(tool: AgentTool): AgentTool {
    const execute = tool.execute.bind(tool);
    return {
      ...tool,
      execute: async (toolCallId, params, signal, onUpdate) => {
        const blocked = await this.checkToolBeforeCall(toolCallId, tool.name, params);
        if (blocked.block) {
          return {
            content: [{ type: "text", text: blocked.reason ?? "Tool call blocked." }],
            details: {},
            isError: true,
          };
        }

        const result = await execute(toolCallId, params, signal, onUpdate);
        let transformed: unknown = result;
        await this.emit({
          type: "tool.after_call",
          toolCallId,
          name: tool.name,
          args: params,
          result: {
            content: Array.isArray((result as { content?: unknown }).content)
              ? (result as { content: Array<{ type: string; text?: string }> }).content
              : [],
            isError: Boolean((result as { isError?: boolean }).isError),
            duration: 0,
            details: (result as { details?: unknown }).details,
          },
          entryId: "",
          setResult: (next: unknown) => {
            transformed = next;
          },
        });
        await this.runToolAfterHandlers(toolCallId, tool.name, params, transformed, (next) => {
          transformed = next;
        });
        return transformed as Awaited<ReturnType<AgentTool["execute"]>>;
      },
    };
  }

  /** 从 Agent 消息内容中提取纯文本。 */
  private messageText(content: AgentContentMessage["content"]): string {
    if (typeof content === "string") return content;
    return content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("");
  }

  /** 将 Agent 消息内容转换为扩展事件使用的内容格式。 */
  private toMessageContent(content: AgentContentMessage["content"]): MessageContent[] {
    if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
    return content
      .filter((part) => part.type === "text" || part.type === "thinking")
      .map((part) =>
        part.type === "text"
          ? { type: "text" as const, text: part.text }
          : { type: "thinking" as const, text: part.text },
      );
  }

  /** 把 Harness 事件转换为零个或多个扩展事件。 */
  private mapHarnessEvent(
    event: AgentHarnessEvent,
    options?: { previousMessageCount?: number },
  ): ExtensionEvent[] {
    const timestamp = Date.now();
    if (event.type === "tool_execution_start") {
      return [
        {
          type: "message.tool_call",
          toolCallId: event.toolCallId,
          name: event.toolName,
          args: event.args,
          entryId: "",
          timestamp,
        },
      ];
    }
    if (event.type === "tool_execution_end") {
      return [
        {
          type: "message.tool_result",
          toolCallId: event.toolCallId,
          result: event.result,
          isError: Boolean(event.isError),
          entryId: "",
          timestamp,
        },
      ];
    }
    if (event.type !== "agent_end") return [];

    const events: ExtensionEvent[] = [];
    const start = options?.previousMessageCount ?? 0;
    for (let index = start; index < event.messages.length; index++) {
      const message = event.messages[index] as AgentContentMessage;
      const entryId = `agent-${index}`;
      if (message.role === "user") {
        events.push({
          type: "message.user",
          text: this.messageText(message.content),
          messageId: entryId,
          entryId,
          timestamp,
        });
      } else if (message.role === "assistant") {
        events.push({
          type: "message.assistant",
          messageId: entryId,
          entryId,
          content: this.toMessageContent(message.content),
          stopReason: (event as AgentHarnessEvent & { stopReason?: string }).stopReason,
          timestamp,
        });
      }
    }
    return events;
  }
}
