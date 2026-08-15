# Agent 扩展运行时

Agent 扩展通过 `defineAgentExtension()` 声明。扩展的 `setup(ctx)` 对每个 Agent runtime generation 只执行一次；Session 初始化通过 Agent 的受管事件 `session.setup` 完成。

## 基本结构

```ts
import { defineAgentExtension } from "pi-supervisor";

export default defineAgentExtension({
  name: "example",

  setup(ctx) {
    ctx.agent.on("session.setup", async (session, reason) => {
      // session 就是旧 ExtensionContext.session。
      // reason: created | restored | extension_reload
    });
  },
});
```

职责划分：

- `setup(ctx)`：Agent 级共享状态、工具定义、策略配置、数据库和 EventBus。
- `ctx.agent.on("session.setup", handler)`：初始化该 Agent 当前加载的每个 Session。
- `session.on(...)`：当前 Session 的消息、工具、Turn 和生命周期事件。
- `ctx.events`：扩展之间主动发布的业务事件，不承担运行时生命周期。

## API 数据结构

```ts
type SessionSetupReason = "created" | "restored" | "extension_reload";
type ExtensionCleanup = () => void | Promise<void>;

interface AgentExtensionDefinition {
  name: string;
  readonly scope: "agent";
  setup(context: AgentExtensionContext): void | ExtensionCleanup | Promise<void | ExtensionCleanup>;
}

interface AgentExtensionContext {
  readonly agent: AgentExtensionAgent;
  readonly policies: {
    disable(policyId: string): void;
    isDisabled(policyId: string): boolean;
  };
  readonly db: ExtensionRawDatabase;
  readonly ui: SupervisorUiFacade;
  readonly events: EventBus;
  readonly watson: WatsonFacade;

  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void;
  exec(command: string, args: string[], options?: AgentExecOptions): Promise<ExecResult>;
}

interface AgentExtensionAgent {
  readonly id: number;
  readonly name: string;
  readonly providerId: number;
  readonly modelId: string;
  readonly backendType: string;
  readonly systemPrompt: string | undefined;
  readonly model: ModelInfo | undefined;

  on(
    event: "session.setup",
    handler: (
      session: ExtensionSession,
      reason: SessionSetupReason,
    ) => void | ExtensionCleanup | Promise<void | ExtensionCleanup>,
  ): void;

  registerTool<TParams, TResult>(definition: ToolDefinition<TParams, TResult>): void;
  unregisterTool(name: string): void;
  registerSlash(name: string, definition: ExtensionSlashDefinition): void;
  unregisterSlash(name: string): void;
  listTools(): ToolInfo[];
  getTool(name: string): ToolInfo | undefined;
}
```

`ExtensionSession` 保留原 `ExtensionContext.session` 的身份、消息、meta、workflow、tasks、todos、spawn、cwd 和 system prompt 能力，并增加 Session 事件及工具状态：

```ts
interface ExtensionSession {
  readonly id: number;
  readonly cwd: string;
  readonly dir: string;
  readonly isMain: boolean;
  readonly isChild: boolean;
  readonly signal: AbortSignal | undefined;

  readonly messages: ExtensionSessionMessages;
  readonly meta: ExtensionSessionMeta;
  readonly workflow: ExtensionSessionWorkflow;
  readonly tasks: ExtensionSessionTasks;
  readonly todos: ExtensionSessionTodos;
  readonly activity: { touch(): void };
  readonly project: SupervisorProjectFacade;
  readonly inject: TurnInjectorFacade;

  on<K extends SessionExtensionEvent["type"]>(
    event: K,
    handler: SessionEventHandler<K>,
    options?: ExtensionEventHandlerOptions,
  ): void;

  readonly tools: {
    activate(names: string[]): Promise<void>;
    deactivate(names: string[]): Promise<void>;
    enable(name: string): void;
    disable(name: string, reason?: string): void;
    beforeUse(handler: ToolGuardHandler, options?: { priority?: number }): void;
    afterUse(handler: ToolResultHandler, options?: { priority?: number }): void;
  };

  setCwd(path: string): Promise<void>;
  appendSystemPrompt(content: string): Promise<void>;
  upsertSystemPromptBlock(id: string, content: string): Promise<void>;
  spawn(request: SpawnSessionRequest): Promise<SpawnSessionResult>;
  sendUserMessage(content: string, options?: SendUserMessageOptions): Promise<void>;
  finish(sessionId?: number): Promise<void>;
}
```

`activate/deactivate` 控制工具在当前 Session 中是否对模型可见；`enable/disable` 控制当前 Session 是否允许调用工具。两组状态都不属于 Agent。

`ctx.agent.registerTool/registerSlash` 的归属由调用位置决定：在 Agent `setup` 中调用时注册到该 Agent 的全部已加载 Session；在 `session.setup` handler 中调用时只注册到当前 Session，并可安全捕获该 Session 的状态。

## 生命周期

`session.setup` 只针对已加载的 Session，不会遍历或唤醒数据库中的 idle、finished、stopped 历史 Session。

```text
新建 Session runtime       → reason = created
恢复已有 Session runtime  → reason = restored
Agent 扩展重载            → reason = extension_reload
```

Session 初始化顺序：

```text
1. 创建 Session 数据、目录和 ExtensionSession facade
2. 触发 agent.on("session.setup") 并等待全部 handler
3. 使用最终 cwd、工具和 prompt 状态绑定 harness
4. 开始处理 Session 消息与 Turn 事件
```

旧的 `session.create`、`session.prepare`、`session.start` 不再属于 Session 事件。原先在这些事件中的 worktree、任务恢复和项目服务初始化逻辑迁入 `session.setup`。

## Session 事件

```ts
ctx.agent.on("session.setup", (session) => {
  session.on("message.user", async (event, eventCtx) => {
    ctx.log("info", "message received", {
      sessionId: session.id,
      messageId: event.messageId,
      timestamp: eventCtx.timestamp,
    });
  });

  session.on("session.before_delete", async () => {
    await stopExternalService(session.id);
  });
});
```

Session 事件包括：

- 生命周期：`session.before_complete`、`session.achieve`、`session.before_delete`、`session.before_sync`、`session.after_sync`、`session.services_wake`、`session.end`。
- 消息：`message.user`、`message.assistant`、`message.tool_call`、`message.tool_result`、`message.custom`。
- Agent harness：`agent.start`、`agent.end`、`agent.error`、`agent.abort`。
- Turn、工具与压缩：`turn.*`、`step.*`、`tool.*`、`compact.*`、`model.change`。

其中 `agent.start/end/error/abort` 表示当前 Session 内 harness 的运行，不是 Agent 实体配置事件。

## 自动清理

运行时为每次 `session.setup` 建立 Session scope，并自动追踪以下资源：

- `session.on()` 事件监听器。
- Agent 扩展注册到 Session 的工具和 slash command。
- 工具可见性、调用许可和 before/after guard。
- 运行时管理的其他 Session 注册项。

Session 卸载、删除或 Agent generation 切换后，这些资源按 owner 自动移除，不需要扩展保存 `off()`。

只有运行时无法感知的资源才返回 cleanup，例如定时器、原生事件监听器、第三方订阅、扩展自行启动的进程或文件句柄：

```ts
ctx.agent.on("session.setup", (session) => {
  const timer = setInterval(() => session.activity.touch(), 60_000);
  return () => clearInterval(timer);
});
```

`setup(ctx)` 返回的 cleanup 清理整个 Agent 扩展实例；`session.setup` handler 返回的 cleanup 只清理对应 Session scope。

## 隐藏策略

策略使用相同的 Agent 扩展结构，但不显示在 UI 中。普通扩展先声明禁用策略，随后加载未禁用策略；分发 Session setup 时策略 handler 优先执行。

```ts
export default defineAgentExtension({
  name: "coding-agent",
  setup(ctx) {
    ctx.policies.disable("session-activity");
  },
});
```

默认 `session-activity` 策略监听 Session 消息活动：创建或最后一次对话 24 小时后把 `active` 转为 `idle`，再次对话时恢复 `active`。
