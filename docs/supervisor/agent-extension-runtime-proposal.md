# Agent 级扩展运行时提案

> 本文描述拟议 API，不代表当前代码已经实现。目标是先确认扩展模型，再迁移现有 Session 级扩展运行时。

## 目标模型

扩展绑定到 Agent，并且每个 Agent 在 Supervisor 进程内只有一个扩展运行时。Agent 创建的每个 Session 只建立轻量绑定，不重复执行扩展的 Agent 级初始化。

```text
AgentExtensionRuntime
├─ Extension: coding-agent
├─ Extension: task-management
├─ Strategy: session-activity（隐藏）
└─ Session bindings
   ├─ Session 101 / generation 7
   ├─ Session 102 / generation 7
   └─ Session 103 / generation 7
```

所有权约定：

- Agent 级：扩展配置、策略禁用、共享缓存、扩展版本、Agent 事件。
- Session 级：消息监听、工具实例、system prompt overlay、cwd、审批和临时状态。
- Project 级：项目资源、项目 Skill 和项目服务。
- 执行记录：继续使用 `jobs` 平台表，不保存在扩展实例内。

## Agent 与 Session 数据结构

以下类型用于说明边界；字段名可以在实现阶段与现有数据库类型对齐。持久化记录只保存可恢复数据，不保存函数、事件监听器、进程句柄或 `AbortController`。

### 持久化 Agent

```ts
interface AgentRecord {
  id: number;
  name: string;
  backendType: "native" | "codex" | "claude" | "acp" | string;
  providerId: number | null;
  modelId: number | null;
  toolsPreset: "coding" | "readonly" | "none";
  systemPrompt: string | null;
  homeDir: string;
  isBuiltin: boolean;
  spawnType: string | null;
  permissionRules: AgentPermissionRules;
  meta: {
    /** Agent 明确禁用的隐藏策略，应用于该 Agent 的全部 Session。 */
    disabledPolicies?: string[];
    /** 其他 Agent 级扩展数据必须使用扩展命名空间。 */
    [key: string]: unknown;
  };
}
```

Agent 与扩展的安装资源分开保存：

```ts
interface AgentResourceBinding {
  agentId: number;
  resourceId: number;
  kind: "extension" | "skill" | "prompt" | "mcp" | "tool";
  enabled: boolean;
}
```

`AgentRecord` 决定身份和模型；`AgentResourceBinding` 决定这个 Agent 使用哪些扩展和资源。修改扩展绑定后，只重建对应 Agent 的扩展运行时。

### 持久化 Session

```ts
type SessionStatus =
  | "initializing"
  | "active"
  | "running"
  | "blocked"
  | "idle"
  | "finish"
  | "finished"
  | "error"
  | "stopped";

interface SessionRecord {
  id: number;
  projectId: number | null;
  parentId: number | null;
  agentId: number;
  status: SessionStatus;
  cwd: string;
  leafId: string | null;
  title: string | null;
  systemPrompt: string | null;
  errorMsg: string | null;
  createdAt: number;
  lastActiveAt: number;
  meta: {
    services?: unknown;
    tasks?: unknown[];
    currentTask?: string;
    todos?: unknown[];
    subagentIds?: number[];
    git?: {
      worktreePath?: string;
      branch?: string;
      lastCommit?: string;
      mergeError?: string;
    };
    [key: string]: unknown;
  };
}
```

Session 只通过 `agentId` 引用 Agent。它不保存扩展实例、完整 system prompt 快照或已经拼装好的工具表；这些内容在运行时根据当前 Agent 配置重新生成。

### 进程内 Agent 扩展运行时

```ts
interface AgentExtensionRuntime {
  readonly agentId: number;
  readonly generation: number;
  readonly state: "staging" | "active" | "disposing" | "disposed";
  readonly controller: AbortController;

  /** 普通扩展，按 extension id 唯一。 */
  readonly extensions: Map<string, LoadedAgentExtension>;

  /** 未被禁用的隐藏策略，按 policy id 唯一。 */
  readonly strategies: Map<string, LoadedAgentStrategy>;

  /** Agent 级事件；不持有某个固定 SessionContext。 */
  readonly events: AgentEventRegistry;

  /** sessionId -> extensionId/policyId -> binding slot。 */
  readonly sessionBindings: Map<number, Map<string, SessionBindingSlot>>;
}

interface LoadedAgentExtension {
  id: string;
  sourcePath: string;
  cleanup?: () => void | Promise<void>;
}

interface LoadedAgentStrategy {
  id: string;
  cleanup?: () => void | Promise<void>;
}
```

Supervisor 按 `agentId` 保存运行时：

```ts
interface SupervisorRuntimeState {
  agentExtensions: Map<number, AgentExtensionRuntime>;
  sessions: Map<number, ManagedSessionRuntime>;
}
```

同一个 Agent 的多个 Session 引用同一个 `AgentExtensionRuntime`。Session 删除时只删除对应的 `sessionBindings`；最后一个 Session 删除后也不要求立刻卸载 Agent 扩展运行时。

### 进程内 Session 运行时

```ts
interface ManagedSessionRuntime {
  readonly sessionId: number;
  readonly agentId: number;
  readonly projectId: number | null;
  readonly controller: AbortController;
  readonly harness: AgentHarness | ExternalAgentRuntime;

  /** 指向当前 active generation，不拥有 Agent 扩展实例。 */
  agentExtensions: AgentExtensionRuntime;

  /** 当前 Session 的消息、工具、slash、overlay 和 Job handler。 */
  messages: SessionMessageRuntime;
  tools: SessionToolRegistry;
  commands: SessionCommandRegistry;
  systemPrompt: SessionSystemPromptOverlay;
}
```

提供给扩展事件的 `SessionBindingContext` 是 `ManagedSessionRuntime` 的受限 facade。它只暴露当前扩展可以操作的 Session 能力，并自动把注册项标记为当前 `{ agentId, extensionId, sessionId, generation }` owner。

### 引用关系

```text
AgentRecord 1
├─ AgentResourceBinding N
├─ AgentExtensionRuntime 1（每个 Supervisor 进程）
│  ├─ LoadedAgentExtension N
│  ├─ LoadedAgentStrategy N
│  └─ SessionBindingSlot N
└─ SessionRecord N
   └─ ManagedSessionRuntime 0..1
      └─ 引用 AgentExtensionRuntime 当前 generation
```

数据库记录与运行时对象通过 ID 关联，不互相嵌套序列化。Supervisor 重启后，先恢复 `AgentExtensionRuntime`，再为需要运行时的 Session 触发 `session.attach`。

## 扩展包结构

```text
my-extension/
├─ package.json
├─ index.ts
├─ session.ts
└─ README.md
```

`package.json`：

```json
{
  "name": "my-agent-extension",
  "version": "1.0.0",
  "type": "module",
  "main": "./index.ts"
}
```

`index.ts`：

```ts
import { defineAgentExtension } from "pi-supervisor";
import { bindSession } from "./session.js";

export default defineAgentExtension({
  name: "my-agent-extension",

  async setup(agent) {
    // Agent 级配置：该 Agent 创建的所有 Session 都不使用此策略。
    agent.policies.disable("session-activity");

    // Agent 级共享状态，只初始化一次。
    const cache = new Map<string, string>();

    // attach 会对现有 Session 回放，也会在以后创建 Session 时触发。
    const offAttach = agent.on("session.attach", async ({ session }) => {
      return bindSession(session, cache);
    });

    // Agent 级事件，不属于任何一个 Session。
    const offModel = agent.on("agent.model_changed", (event) => {
      cache.clear();
      agent.log("info", "model changed", { modelId: event.modelId });
    });

    // Agent 扩展卸载或热重载时执行一次。
    return async () => {
      offModel();
      await offAttach();
      cache.clear();
    };
  },
});
```

`session.ts`：

```ts
import { Type, type SessionBindingContext } from "pi-supervisor";

export async function bindSession(session: SessionBindingContext, cache: Map<string, string>) {
  // 注册项自动归属于当前 binding generation。
  session.tools.register({
    name: "project_note",
    description: "Read a cached project note",
    parameters: Type.Object({ key: Type.String() }),
    async execute({ key }, execution) {
      execution.signal?.throwIfAborted();
      return {
        content: [{ type: "text", text: cache.get(key) ?? "not found" }],
      };
    },
  });

  session.systemPrompt.upsert("my-extension", "Use project_note for shared notes.");

  session.on("message.user", async (event) => {
    session.signal.throwIfAborted();
    session.log("debug", "user message", { messageId: event.messageId });
  });

  session.on("session.before_delete", async () => {
    // 可选的业务清理；监听器本身无需手动 off，binding 会统一回收。
  });

  // 可选。用于扩展自行创建且运行时无法自动识别的资源。
  return async () => {
    await session.jobs.cancelOwned();
  };
}
```

## API 草案

```ts
interface AgentExtensionDefinition {
  name: string;
  setup(ctx: AgentExtensionContext): void | AgentCleanup | Promise<void | AgentCleanup>;
}

interface AgentExtensionContext {
  readonly agent: AgentIdentity;
  readonly policies: {
    disable(policyId: string): void;
    isDisabled(policyId: string): boolean;
  };
  readonly sessions: {
    list(): SessionSummary[];
    get(sessionId: number): SessionSummary | undefined;
  };
  on<K extends AgentEvent["type"]>(type: K, handler: AgentEventHandler<K>): AgentCleanup;
  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void;
}

interface SessionAttachEvent {
  type: "session.attach";
  reason: "created" | "runtime_restore" | "extension_reload";
  session: SessionBindingContext;
}

interface SessionBindingContext {
  readonly id: number;
  readonly projectId: number | null;
  readonly cwd: string;
  readonly dir: string;
  readonly signal: AbortSignal;
  readonly messages: SessionMessagesFacade;
  readonly meta: SessionMetaFacade;
  readonly tools: SessionToolRegistry;
  readonly jobs: SessionJobFacade;
  readonly systemPrompt: SessionSystemPromptFacade;

  on<K extends SessionEvent["type"]>(
    type: K,
    handler: SessionEventHandler<K>,
    options?: EventHandlerOptions,
  ): SessionCleanup;

  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void;
}
```

`session.attach` 是受管生命周期事件：handler 的返回值会成为该扩展在对应 Session 上的 cleanup。运行时对已有 Session 重放一次，并在新 Session 建立 runtime 时触发一次。

重要限制：`AgentExtensionContext` 不提供 `ctx.session`。扩展只能从 `session.attach` 或其他 Session 事件参数中取得 Session，避免多个 Session 并发时串用上下文。

## 策略加载与禁用

策略是隐藏的 Agent 扩展，不进入资源目录、扩展列表或 UI。加载分为两个阶段：

```text
1. 创建 AgentExtensionRuntime staging generation
2. 加载普通扩展 setup
3. 汇总 agent.meta.disabledPolicies 和扩展声明的禁用项
4. 加载未禁用的隐藏策略
5. 为该 Agent 的现有 Session 建立 staging binding
6. 原子启用新 generation
7. 此后再分发 session.create / message.* 等事件
```

扩展只能在 Agent `setup()` 阶段调用 `agent.policies.disable()`。运行过程中不允许动态禁用策略；修改策略集合需要触发 Agent 扩展运行时重载。

Agent 配置示例：

```json
{
  "disabledPolicies": ["session-activity"]
}
```

Agent 配置和扩展声明取并集。策略一旦被禁用，就不会 setup、注册事件或启动调度器。

## Session 如何停止旧绑定

每个 Session 保存按扩展划分的 binding slot：

```ts
interface SessionBindingSlot {
  agentId: number;
  extensionId: string;
  generation: number;
  controller: AbortController;
  disposers: Array<() => void | Promise<void>>;
  state: "staging" | "active" | "disposing" | "disposed";
}
```

`session.on()`、`session.tools.register()`、system prompt block、job handler 等注册操作都必须记录 owner：

```text
owner = { agentId, extensionId, sessionId, generation }
```

解绑旧 binding 时按以下顺序执行：

1. 将 slot 标记为 `disposing`，事件分发器立即停止向它投递新事件。
2. 调用 `controller.abort("extension_reload")`，通知正在执行的 handler/tool 尽快结束。
3. 从 Session 工具表、事件表、slash 表和 system prompt overlay 中按 owner 批量移除注册项。
4. 逆序执行 disposer stack，清理定时器、订阅、进程句柄等扩展自有资源。
5. 将 slot 标记为 `disposed` 并从 Session 删除。

事件分发器在调用 handler 前必须同时检查：

```ts
slot.state === "active" &&
  slot.generation === session.activeGeneration &&
  !slot.controller.signal.aborted;
```

因此，即使旧事件已经进入队列，generation 切换后也不会再执行。已经开始执行的异步操作通过 `AbortSignal` 协作取消；不响应取消的操作允许自然结束，但不能再写入已失效 generation 的工具表或 overlay。

## 热重载流程

扩展修改后按 Agent 重载一次，而不是逐个 Session 重跑扩展 setup：

```text
旧 generation N 正常服务
          │
          ├─ 构建 Agent runtime generation N+1
          ├─ 普通扩展 setup
          ├─ 策略解析与 setup
          ├─ 为所有 Session 创建 staging bindings
          │
          ├─ 任一步失败 → 清理 N+1，继续使用 N
          │
          └─ 全部成功
                ├─ 原子切换 activeGeneration = N+1
                ├─ 新事件只进入 N+1
                └─ abort 并清理 generation N
```

工具调用的建议行为：

- 尚未开始的旧 generation 工具调用直接拒绝，并提示扩展已重载。
- 已经开始的工具调用收到 abort signal。
- jobs 不因重载默认删除执行记录；仅取消由扩展注册为 `cancelOnReload` 的运行中 Job。
- 新 generation 加载失败时，不触碰旧工具、事件和 Session binding。

## Session 生命周期示例

```ts
export default defineAgentExtension({
  name: "session-audit",
  setup(agent) {
    return agent.on("session.attach", ({ session }) => {
      session.on("session.create", async (event) => {
        await session.meta.patch({ "sessionAudit.createdBy": event.creationMethod });
      });

      session.on("session.start", () => {
        session.log("info", "session started");
      });

      session.on("session.before_delete", async () => {
        await session.jobs.cancelOwned();
      });
    });
  },
});
```

对于新 Session，Supervisor 必须先建立全部 active generation bindings，再触发 `session.create`。对于运行时启动前就需要修改 cwd 的能力（例如 git worktree），应提供独立的 `session.prepare` 阶段，但仍由 Agent 扩展实例接收，不重新执行 Agent `setup()`。

## 与当前 API 的主要差异

| 当前实现                               | 提案                                               |
| -------------------------------------- | -------------------------------------------------- |
| 每个 Session 执行一次扩展 `setup(ctx)` | 每个 Agent 执行一次 `setup(agent)`                 |
| `ctx.session` 始终指向当前 Session     | 通过 `session.attach` 等事件获得 SessionContext    |
| 清理由扩展逐项保存 `off()`             | binding scope 自动追踪 owner，并支持批量回收       |
| 修改扩展时逐 Session reload            | 按 Agent 构建新 generation，并原子切换全部 Session |
| 策略和扩展加载顺序互相影响             | 普通扩展先声明禁用项，策略随后加载，事件最后分发   |

## 验收条件

- 同一 Agent 无论有多少 Session，扩展 Agent `setup()` 只执行一次。
- 新建 Session 会自动获得所有扩展 binding，并在绑定完成后收到 `session.create`。
- 删除 Session 只清理该 Session 的 binding，不卸载 Agent 扩展实例。
- 修改扩展只重载对应 Agent，不影响其他 Agent。
- 新 generation 失败时，所有旧 Session 继续使用旧 generation。
- 切换成功后，旧 generation 不再收到事件，工具和 overlay 不残留。
- Agent 或普通扩展禁用策略后，该策略不注册事件，也不启动 Scheduler。
