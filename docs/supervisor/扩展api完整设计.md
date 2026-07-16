# 扩展 API 完整设计

本文重新设计 `supervisor` 的扩展 API。目标不是继续往 `ctx` 上零散添加函数，而是把 `supervisor` 的核心元素设计成可操作对象，让扩展拿到这些对象实例后，用统一方式操作 session、agent、tools、messages、db、project、runtime。

这份设计也吸收一个关键判断：工具必须有 `access`。子代理如果不允许编辑，就不应该只靠 prompt 说“不要编辑”，而应该根据工具 access 直接过滤或禁止 `edit`、`write`、高风险 `bash` 等工具。

## 核心方向

扩展应拿到的是一组核心对象：

```ts
interface ExtensionContext {
  extension: ExtensionInstance;
  db: SupervisorDbFacade;
  session: SupervisorSession;
  agent: SupervisorAgent;
  project: SupervisorProject;
  runtime: SupervisorRuntime;
  tools: ToolRegistry;
  ui: SupervisorUi;
  system: SupervisorSystem;
}
```

也就是说：

```text
我要获取当前消息 -> ctx.session.messages.list()
我要获取某个 session 的消息 -> ctx.db.sessions.get(id).messages.list()
我要获取当前 agent 的工具 -> ctx.agent.tools.list()
我要改当前 session 的工具集 -> ctx.session.tools.setPolicy(...)
我要跨 session 创建子代理 -> ctx.db.sessions.spawn(...)
我要查成员 agent -> ctx.session.members.list()
我要直接写复杂 SQL -> ctx.db.sqlite.prepare(...).all(...)
```

不要再继续这样扩展：

```text
ctx.getMessages()
ctx.getChildSessions()
ctx.getMemberAgentsByTag()
ctx.spawnSession()
ctx.promptSession()
ctx.getAgentTools()
```

这些会让 API 越来越平，越来越难维护。

## 为什么需要对象模型

子代理扩展会同时操作很多核心元素：

```text
当前 session：判断是不是主 session
父 session：创建 child session
child session：等待完成、读取最后输出
agent：选择哪个子代理模板、读取工具配置
tools：根据 access 过滤工具
messages：写入子代理结果
db：跨 session 查询
ui：广播进度
runtime：等待 turn 结束、取消运行
```

如果都做成 `ctx.xxx()` 函数，扩展会变成一堆无归属方法。对象模型更自然：

```ts
const child = await ctx.db.sessions.spawn({
  parent: ctx.session,
  agent: reviewAgent,
  instructions: prompt,
});

await child.runtime.waitForEnd();
const result = await child.messages.lastAssistantText();
```

## 工具 access 设计

### 为什么必须有 access

子代理经常只应该读，不应该写。

比如 review 子代理：

```text
允许：
- read
- grep
- list
- lsp diagnostics

禁止：
- edit
- write
- bash 写入命令
```

如果只靠 prompt：

```text
你是 review 子代理，不要改代码。
```

这不可靠。模型仍可能调用 `edit` 或 `bash`。所以工具必须声明自己的访问能力，运行时根据 policy 过滤或拒绝。

### ToolAccess 类型

建议每个工具都有 `access`：

```ts
type ToolAccess =
  | "read"
  | "search"
  | "inspect"
  | "write"
  | "edit"
  | "shell"
  | "network"
  | "mcp"
  | "ask"
  | "agent"
  | "state"
  | "dangerous";

interface ToolAccessSpec {
  level: "read" | "write" | "dangerous";
  tags: ToolAccess[];
  resources?: ToolResourceAccess[];
}

interface ToolResourceAccess {
  kind: "file" | "shell" | "network" | "session" | "agent" | "mcp";
  mode: "read" | "write" | "execute" | "spawn";
  pattern?: string;
}
```

例子：

```ts
read.access = {
  level: "read",
  tags: ["read"],
  resources: [{ kind: "file", mode: "read" }],
};

grep.access = {
  level: "read",
  tags: ["search"],
  resources: [{ kind: "file", mode: "read" }],
};

edit.access = {
  level: "write",
  tags: ["edit"],
  resources: [{ kind: "file", mode: "write" }],
};

write.access = {
  level: "write",
  tags: ["write"],
  resources: [{ kind: "file", mode: "write" }],
};

bash.access = {
  level: "dangerous",
  tags: ["shell"],
  resources: [{ kind: "shell", mode: "execute" }],
};

Agent.access = {
  level: "dangerous",
  tags: ["agent"],
  resources: [{ kind: "agent", mode: "spawn" }],
};
```

这里把 `bash` 默认视为 `dangerous`，因为它可以读、写、联网、删除、启动进程。以后可以进一步做命令级分析，把 `ls`、`cat`、`rg` 这类只读 shell 降级，但第一版不必复杂化。

### 子代理工具策略

子代理创建时应能指定工具策略：

```ts
const child = await ctx.db.sessions.spawn({
  parent: ctx.session,
  agent: reviewAgent,
  instructions: prompt,
  toolPolicy: ToolPolicy.readonly(),
});
```

`ToolPolicy.readonly()` 等价于：

```ts
{
  allowAccessLevels: ["read"],
  denyTags: ["write", "edit", "shell", "agent", "dangerous"],
}
```

这样子代理即使拿到默认 coding tools，也会被过滤：

```text
read    保留
grep    保留
ls      保留
lsp diagnostics 保留
edit    移除
write   移除
bash    移除或只允许白名单命令
Agent   移除
```

### 工具策略对象

```ts
class ToolPolicy {
  static readonly(): ToolPolicy;
  static coding(): ToolPolicy;
  static none(): ToolPolicy;

  allowTool(name: string): this;
  denyTool(name: string): this;
  allowAccess(level: "read" | "write" | "dangerous"): this;
  denyTag(tag: ToolAccess): this;
  allowResource(resource: ToolResourceAccess): this;

  check(tool: SupervisorTool, call?: ToolCall): ToolDecision;
  filter(tools: SupervisorTool[]): SupervisorTool[];
}

type ToolDecision = { allow: true } | { allow: false; reason: string };
```

Plan mode、readonly 子代理、review 子代理，都应通过 `ToolPolicy` 实现，而不是靠 prompt。

## 核心对象总览

### SupervisorDbFacade

跨对象入口。用于查询和创建核心对象。

```ts
class SupervisorDbFacade {
  sessions: SessionRepository;
  agents: AgentRepository;
  projects: ProjectRepository;
  providers: ProviderRepository;
  messages: MessageRepository;
  sqlite: SqliteAccess;
}
```

扩展如果要跨 session，应从 `ctx.db` 进入：

```ts
const parent = await ctx.db.sessions.get(parentId);
const child = await ctx.db.sessions.get(childId);
const allChildren = await parent.children.list();
```

### 裸 SQLite 访问

扩展 API 应提供两层 DB 能力：

```text
常规扩展：优先使用 ctx.db.sessions / ctx.db.agents / ctx.session.messages 等对象 API。
高级扩展：可以通过 ctx.db.sqlite 直接访问 better-sqlite3 实例或受控 wrapper。
```

设计：

```ts
class SqliteAccess {
  readonly path: string;
  readonly readonly: boolean;

  prepare<TParams extends unknown[] = unknown[], TResult = unknown>(
    sql: string,
  ): SqliteStatement<TParams, TResult>;

  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult;

  exec(sql: string): void;
}

interface SqliteStatement<TParams extends unknown[], TResult> {
  get(...params: TParams): TResult | undefined;
  all(...params: TParams): TResult[];
  run(...params: TParams): { changes: number; lastInsertRowid: number | bigint };
}
```

高级扩展示例：

```ts
const rows = ctx.db.sqlite
  .prepare<[number], { id: number; status: string }>(
    "SELECT id, status FROM sessions WHERE parent_id = ? ORDER BY created_at DESC",
  )
  .all(ctx.session.id);
```

为什么要暴露：

```text
扩展要接近核心能力。
有些分析类扩展需要复杂 JOIN / 聚合 / FTS 查询。
对象 API 不可能一开始覆盖所有 SQL 场景。
用户实在不行可以自己写 SQL。
```

风险和边界：

```text
默认 capabilities 只给 sqlite:read。
sqlite:write 需要显式声明和用户启用。
写 SQL 后扩展负责维护一致性。
核心对象 API 仍是推荐入口，因为它会发事件、更新状态和同步 UI。
```

capability：

```ts
type DbCapability = "sqlite:read" | "sqlite:write" | "sqlite:transaction";
```

### SupervisorSession

session 是最重要的核心对象。

```ts
class SupervisorSession {
  id: number;
  projectId: number | null;
  parentId: number | null;
  agentId: number | null;
  cwd: string;
  status: SessionStatus;
  branchType: "spawn" | "fork" | "clone" | null;
  depth: number;
  kind: "main" | "subagent" | "fork" | "clone";

  agent: SupervisorAgent | null;
  project: SupervisorProject;
  messages: SessionMessages;
  children: SessionChildren;
  members: SessionMembers;
  runtime: SessionRuntimeHandle;
  tools: SessionToolSet;
  meta: SessionMeta;

  readonly isMain: boolean;
  readonly isChild: boolean;
  readonly isSubagent: boolean;
  readonly isFork: boolean;
  readonly isClone: boolean;

  children(options?: SessionListOptions): Promise<SupervisorSession[]>;
  spawn(options: SpawnSessionOptions): Promise<SupervisorSession>;
  fork(options?: ForkSessionOptions): Promise<SupervisorSession>;
  finish(): Promise<void>;
  reload(): Promise<SupervisorSession>;
  delete(): Promise<void>;
}
```

使用方式：

```ts
if (!ctx.session.isMain) return;

const messages = await ctx.session.messages.list();
const children = await ctx.session.children();
const members = await ctx.session.members.byRole("spawned");
```

### SessionMessages

消息必须挂在 session 上。

```ts
class SessionMessages {
  list(options?: MessageListOptions): Promise<MessageEntry[]>;
  get(entryId: string): Promise<MessageEntry | undefined>;
  currentBranch(): Promise<MessageEntry[]>;
  lastAssistantText(): Promise<string | undefined>;
  search(query: string, options?: MessageSearchOptions): Promise<SearchResult[]>;

  appendCustom(
    customType: string,
    data: unknown,
    options?: {
      display?: boolean;
      source?: string;
    },
  ): Promise<string>;

  patchMeta(entryId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  setMeta(entryId: string, meta: Record<string, unknown>): Promise<void>;
}
```

例子：

```ts
const result = await child.messages.lastAssistantText();

await ctx.session.messages.appendCustom("subagent.result", {
  childSessionId: child.id,
  result,
});
```

### Session Children

```ts
ctx.session.children(options?: SessionListOptions): Promise<SupervisorSession[]>;
ctx.session.spawn(options: SpawnSessionOptions): Promise<SupervisorSession>;
```

例子：

```ts
const child = await ctx.session.spawn({
  parentId: ctx.session.id,
  agent: reviewAgent,
  instructions: prompt,
  branchType: "spawn",
  toolPolicy: ToolPolicy.readonly(),
  meta: {
    subagent: {
      description,
      type: "review",
    },
  },
});
```

注意：`ctx.session.spawn()` 是通用的新 session 创建方法。没有 `parentId` 时，它就是普通新会话；传入 `parentId: ctx.session.id` 时，它才是当前 session 的子代理/子 session。

查询当前 session 的子 session：

```ts
const children = await ctx.session.children();
```

跨 session 时，db 只负责拿数据库数据；真正带业务行为的操作仍应该回到核心 session 对象：

```ts
const row = await ctx.db.sessions.get(parentId);
const parent = await ctx.system.sessions.get(row.id);
const child = await parent.spawn({ parentId: parent.id, agentId: reviewAgent.id, instructions });
```

### SessionMembers

成员关系也挂在 session 上。

```ts
class SessionMembers {
  list(): Promise<MemberAgent[]>;
  byRole(role: string): Promise<MemberAgent[]>;
  byTag(tag: string): Promise<MemberAgent[]>;

  resolveSpawnable(options?: { subagentType?: string; agentId?: number }): Promise<MemberAgent>;

  upsert(
    agent: SupervisorAgent | number,
    options?: {
      role?: string;
      tags?: string[];
    },
  ): Promise<MemberAgent>;

  remove(agent: SupervisorAgent | number): Promise<void>;
}
```

子代理扩展用法：

```ts
const member = await ctx.session.members.resolveSpawnable({
  subagentType: params.subagent_type,
});

const child = await ctx.session.spawn({
  parentId: ctx.session.id,
  agent: member.agent,
  instructions: params.prompt,
});
```

### SessionRuntimeHandle

运行控制挂在 session 上。

```ts
class SessionRuntimeHandle {
  isLoaded(): boolean;
  isIdle(): boolean;
  isStreaming(): boolean;

  prompt(message: string, options?: PromptOptions): Promise<void>;
  followUp(message: string, options?: PromptOptions): Promise<void>;
  steer(message: string): Promise<void>;
  abort(reason?: string): Promise<void>;

  waitForIdle(options?: { timeoutMs?: number }): Promise<void>;
  waitForEnd(options?: { timeoutMs?: number }): Promise<SessionRunResult>;

  compact(options?: { customInstructions?: string }): Promise<CompactionResult>;
  setModel(provider: string, modelId: string): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): Promise<void>;
}
```

例子：

```ts
await child.runtime.waitForEnd({ timeoutMs: 30 * 60 * 1000 });
```

### SessionToolSet

当前 session 的工具集。

```ts
class SessionToolSet {
  list(options?: { includeDisabled?: boolean }): Promise<SupervisorTool[]>;
  get(name: string): Promise<SupervisorTool | undefined>;

  setPolicy(policy: ToolPolicy): Promise<void>;
  getPolicy(): Promise<ToolPolicy>;

  enable(name: string): Promise<void>;
  disable(name: string, reason?: string): Promise<void>;
  setActive(names: string[]): Promise<void>;

  register(tool: ToolDefinition, options?: ToolRegistrationOptions): void;
  wrap(name: string, wrapper: ToolWrapper): void;
  beforeUse(handler: ToolGuardHandler, options?: { priority?: number }): () => void;
  afterUse(handler: ToolResultHandler, options?: { priority?: number }): () => void;
}
```

子代理禁用编辑工具：

```ts
await child.tools.setPolicy(
  ToolPolicy.readonly().denyTool("edit").denyTool("write").denyTool("bash").denyTool("Agent"),
);
```

Plan mode 允许写 plan 文件但禁止改项目代码：

```ts
await ctx.session.tools.setPolicy(
  ToolPolicy.readonly()
    .allowTool("write")
    .allowResource({
      kind: "file",
      mode: "write",
      pattern: `${ctx.session.sessionDir}/plan.md`,
    }),
);
```

### SupervisorAgent

agent 代表模板定义，不代表运行中的 session。

```ts
class SupervisorAgent {
  id: number;
  name: string;
  description: string | null;
  providerId: number;
  modelId: string | null;
  toolsPreset: "coding" | "readonly" | "none" | null;
  homeDir: string | null;
  meta: Record<string, unknown>;

  tools: AgentToolCatalog;
  resources: AgentResources;
  systemPrompt: AgentSystemPrompt;

  reload(): Promise<SupervisorAgent>;
  patchMeta(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
}
```

### AgentToolCatalog

“我要获取工具，要根据 agent 获取”对应这个对象。

```ts
class AgentToolCatalog {
  list(options?: { cwd?: string }): Promise<SupervisorTool[]>;
  preset(): "coding" | "readonly" | "none";
  defaultPolicy(): ToolPolicy;
}
```

例子：

```ts
const tools = await ctx.agent.tools.list({ cwd: ctx.session.cwd });
const readonlyTools = ToolPolicy.readonly().filter(tools);
```

### SupervisorTool

所有工具统一建模。

```ts
class SupervisorTool {
  name: string;
  label?: string;
  description: string;
  parameters: unknown;
  source: "builtin" | "extension" | "mcp";
  access: ToolAccessSpec;

  execute(args: unknown, ctx: ToolExecutionContext): Promise<ToolResult>;
}
```

工具没有声明 access 时，默认策略：

```text
read / grep / ls / read_pattern -> read
edit / write / ast_grep(action=edit) / lsp(action=rename) -> write
bash -> dangerous
Agent / spawn_agent -> dangerous + agent spawn
未知工具 -> dangerous
```

未知工具默认 dangerous 很重要。否则扩展工具可能绕过 readonly 子代理。

## 默认工具策略：引用 pi-coding-agent 还是自研

当前 `supervisor` 已经从 `pi-coding-agent` 引入默认工具，但只保留四个：

```text
read
bash
edit
write
```

`pi-coding-agent` 里的默认工具集合是：

```text
coding: read / bash / edit / write
readonly: read / grep / find / ls
all: read / bash / edit / write / grep / find / ls
```

建议：

```text
短期：继续引用 pi-coding-agent 默认工具，但在 supervisor 包装层补 access。
中期：把工具定义统一包装成 SupervisorTool。
长期：如果 supervisor 要成为独立产品，再逐步自研默认工具。
```

不建议现在立刻自研全部默认工具。

原因：

```text
read 要处理截断、图片、路径安全。
bash 要处理 shell 配置、stream、timeout、kill process tree。
edit/write 要处理文件队列、并发写入、错误格式。
grep/find/ls 也有跨平台和忽略规则问题。
```

这些 `pi-coding-agent` 已经有成熟实现。现在 supervisor 真正缺的是：

```text
工具 access
工具策略 ToolPolicy
工具拦截 beforeUse / afterUse
工具对象包装 SupervisorTool
```

所以更好的做法是：

```ts
const piTool = createReadTool(cwd);
const tool = SupervisorTool.fromPiTool(piTool, {
  access: ToolAccess.readFile(),
});
```

子代理只看 `SupervisorTool.access`，不关心底层工具来自 `pi-coding-agent` 还是 supervisor 自研。

### SupervisorProject

项目对象。

```ts
class SupervisorProject {
  id: number;
  cwd: string;
  workDir: string;
  meta: ProjectMeta;

  sessions: ProjectSessions;
  files: ProjectFiles;
}
```

### SupervisorRuntime

当前扩展运行时。

```ts
class SupervisorRuntime {
  on<T extends ExtensionEvent>(type: T, handler: ExtensionEventHandler<T>): () => void;
  emit(event: ExtensionEvent): Promise<void>;
  flow: TurnFlowController;
}
```

### SupervisorUi

`ui` 不是子代理第一期的核心能力。它的用途是让扩展把运行状态和自定义渲染信息交给 Web UI，而不是让扩展直接操作前端 DOM。

第一期只需要：

```ts
class SupervisorUi {
  broadcast(event: ExtensionUiEvent): void;
}
```

子代理扩展可以用它广播：

```json
{
  "type": "subagent.spawned",
  "parentSessionId": 12,
  "childSessionId": 34,
  "description": "Review session API"
}
```

这有什么用：

```text
Web UI 可以立即显示“子代理已启动”。
后台子代理运行时，UI 可以显示进度和状态。
子代理完成后，UI 可以把结果挂到父 session 的消息旁边。
扩展可以不写 HTTP 轮询逻辑。
```

什么先不做：

```text
不先做扩展面板。
不先做自定义前端组件。
不先做工具渲染器 DSL。
```

这些是后续能力。第一期 `ui.broadcast()` 足够。

### TurnFlowController

用于 goal mode、自动继续、失败重试。

```ts
class TurnFlowController {
  enqueue(input: TurnInput, options?: EnqueueTurnOptions): Promise<QueuedTurnInfo>;
  continue(options?: ContinueTurnOptions): Promise<QueuedTurnInfo>;
  pause(reason?: string): Promise<void>;
  resume(reason?: string): Promise<QueuedTurnInfo | undefined>;
  acquireLock(key: string, options?: LockOptions): Promise<TurnFlowLock | undefined>;
  usage(options?: { since?: "session" | "lastTurn" | "lastCheckpoint" }): Promise<TurnUsage>;
}
```

## 子代理扩展如何写

### 注册 Agent 工具

```ts
export default defineExtension({
  name: "subagent-orchestrator",
  setup(ctx) {
    if (!ctx.session.isMain) return;

    ctx.session.tools.register({
      name: "Agent",
      description: "Launch or resume a subagent session.",
      access: {
        level: "dangerous",
        tags: ["agent"],
        resources: [{ kind: "agent", mode: "spawn" }],
      },
      parameters: AgentParams,
      async execute(params, toolCtx) {
        return runAgentTool(ctx, params, toolCtx);
      },
    });
  },
});
```

因为注册时判断了 `ctx.session.isMain`，子代理 session 默认不会再拥有 `Agent` 工具。

### 创建 readonly 子代理

```ts
async function runAgentTool(
  ctx: ExtensionContext,
  params: AgentParams,
  toolCtx: ToolExecutionContext,
) {
  const member = await ctx.session.members.resolveSpawnable({
    subagentType: params.subagent_type,
  });

  const child = await ctx.session.spawn({
    parentId: ctx.session.id,
    agent: member.agent,
    branchType: "spawn",
    instructions: params.prompt,
    toolPolicy: ToolPolicy.readonly()
      .denyTool("edit")
      .denyTool("write")
      .denyTool("bash")
      .denyTool("Agent"),
    meta: {
      subagent: {
        parentSessionId: ctx.session.id,
        parentToolCallId: toolCtx.toolCallId,
        description: params.description,
        type: params.subagent_type ?? "subagent",
        mode: params.run_in_background ? "background" : "foreground",
      },
    },
  });

  if (params.run_in_background) {
    return {
      content: [{ type: "text", text: `Started subagent session ${child.id}.` }],
      details: { sessionId: child.id, status: "running" },
    };
  }

  await child.runtime.waitForEnd({ timeoutMs: 30 * 60 * 1000 });
  const result = await child.messages.lastAssistantText();

  return {
    content: [{ type: "text", text: result ?? "" }],
    details: { sessionId: child.id, result },
  };
}
```

这个例子体现几个关键点：

```text
通过 session.members 选择授权子代理。
通过 session.spawn 创建子 session，parentId 指向当前 session。
通过 toolPolicy 去掉编辑工具。
通过 child.runtime 等待完成。
通过 child.messages 获取结果。
```

## 子代理和默认工具的关系

默认 coding tools 不应该无脑给子代理。

建议策略：

```text
主 session:
  toolsPreset = coding
  access: read + write + shell + agent

review 子代理:
  toolsPreset = coding
  toolPolicy = readonly
  实际可用: read / grep / ls / diagnostics
  禁用: edit / write / bash / Agent

explore 子代理:
  toolPolicy = readonly + allow safe shell search
  实际可用: read / grep / ls / rg-like bash 白名单

coder 子代理:
  toolPolicy = coding
  实际可用: read / edit / write
  是否允许 bash 由成员配置决定

swarm 子代理:
  默认 readonly
  需要写入时必须显式配置
```

也就是说，`toolsPreset` 只是原始工具集合，`ToolPolicy` 才是最终可用工具集合。

## 扩展 API 对象关系

建议关系如下：

```text
ctx
├─ db
│  ├─ sessions
│  ├─ agents
│  ├─ projects
│  └─ messages
├─ session
│  ├─ messages
│  ├─ children
│  ├─ members
│  ├─ runtime
│  ├─ tools
│  └─ meta
├─ agent
│  ├─ tools
│  ├─ resources
│  └─ systemPrompt
├─ project
├─ runtime
│  └─ flow
├─ ui
└─ system
```

这能覆盖常见问题：

```text
获取消息 -> session.messages
获取工具 -> agent.tools 或 session.tools
跨 session -> db.sessions
创建子代理 -> session.spawn({ parentId: session.id, ... })
限制子代理工具 -> child.tools.setPolicy
查授权 agent -> session.members
继续运行 -> session.runtime
自动续跑 -> runtime.flow
```

## 与旧 API 的兼容

旧 API 可以先保留一层兼容映射：

```ts
ctx.sessionId -> ctx.session.id
ctx.cwd -> ctx.session.cwd
ctx.db.getMessages() -> ctx.session.messages.list()
ctx.db.getChildSessions() -> ctx.session.children()
ctx.getMemberAgentsByTag(tag) -> ctx.session.members.byTag(tag)
ctx.registerTool(tool) -> ctx.session.tools.register(tool)
ctx.waitForIdle() -> ctx.session.runtime.waitForIdle()
ctx.sendUserMessage(text) -> ctx.session.runtime.prompt(text)
```

但新文档、示例、内置扩展都应该使用对象模型。

## 实施顺序

### Phase 1：对象模型骨架

- 新增 `SupervisorSession`。
- 新增 `SupervisorAgent`。
- 新增 `SupervisorDbFacade`。
- 新增 `SessionMessages`。
- 新增 `SessionMembers`。
- 新增 `SessionRuntimeHandle`。
- `SupervisorSession` 提供 `children()`、`spawn()`、`fork()`、`finish()` 等业务方法。
- `ExtensionContext` 暴露这些实例。
- 保留旧 API 兼容映射。

### Phase 2：工具 access

- 扩展 `ToolDefinition`，增加 `access`。
- 内建工具补齐 access：
  - `read` / `grep` / `ls` / `read_pattern`: read
  - `edit` / `write`: write
  - `bash`: dangerous
  - `Agent` / `spawn_agent`: dangerous + agent
- 未声明 access 的工具默认 dangerous。
- 新增 `ToolPolicy`。
- `SessionToolSet` 支持 `setPolicy()`。

### Phase 3：工具拦截

- 新增 `session.tools.beforeUse()`。
- 新增 `session.tools.afterUse()`。
- 支持 allow / deny / replace。
- 工具调用前强制执行 `ToolPolicy.check()`。

### Phase 4：跨 session 编排

- `SessionChildren.spawn()`。
- `SessionRuntimeHandle.prompt()`。
- `SessionRuntimeHandle.waitForEnd()`。
- `SessionMessages.lastAssistantText()`。
- `SupervisorDbFacade.sessions.get/list/tree`。

### Phase 5：子代理扩展

- 用扩展实现 `Agent` 工具。
- 只在主 session 注册。
- 用 `SessionMembers.resolveSpawnable()` 做授权。
- 用 `SessionChildren.spawn()` 创建子 session。
- 用 `ToolPolicy.readonly()` 控制 review/explore 子代理。
- foreground 等待结果。
- background 返回 session id。
- resume 使用已有 child session。

### Phase 6：高级能力

- `TurnFlowController` 支持 goal mode。
- `ctx.ui` 支持扩展面板和工具渲染。
- `ctx.system` 支持受控 exec。
- capabilities 从记录升级为强制权限。

## 关键结论

1. 扩展 API 不应继续平铺函数，而应暴露核心对象实例。
2. session 是消息、子 session、成员、运行时、工具策略的聚合根。
3. agent 是工具目录、资源、系统提示的模板对象。
4. db 是跨 session / 跨 agent 查询入口。
5. 工具必须有 access，否则无法可靠实现 readonly 子代理和 plan mode。
6. `toolsPreset` 决定初始工具集合，`ToolPolicy` 决定最终可用工具。
7. 子代理通过扩展实现是可行的，但必须先完善这些核心对象 API。
