# packages/supervisor

SQLite-first 的 headless pi agent 运行时，面向多 session、服务化和多阶段开发范式（SDD）编排。

## 架构

Supervisor 与 `packages/coding-agent` 是同级产品层：二者都基于 `@earendil-works/pi-agent-core` 和 `@earendil-works/pi-ai`，但使用场景不同。

- `coding-agent`：面向单人交互式开发，主存储是 `~/.pi/agent/sessions/*.jsonl`
- `supervisor`：面向 headless、多 session、SDD 编排，主存储是 SQLite

Supervisor **不** 通过子进程调用 `pi --mode rpc`，也 **不** 读写 JSONL 会话。它在同进程内直接宿主：

- `@earendil-works/pi-agent-core` — `AgentHarness`、`Session`、`Agent` 循环
- `@earendil-works/pi-ai` — 模型解析与 API 鉴权
- `@earendil-works/pi-coding-agent` — 默认 coding tools（read / bash / edit / write / grep / find / ls）

每个 session 的对话历史写入 SQLite 表 `messages`，按 `session_id`（外键指向 `sessions.id`）**严格隔离**（根代理与子代理各自独立上下文）。

```
SDD Orchestrator
    │ spawn({ parentId, systemPrompt, ... })
    ▼
SessionManager ──► SupervisorSessionRuntime ──► AgentHarness
    │                         │                      │
    ▼                         ▼                      ▼
sessions 表               messages 表            coding tools
```

## 文件结构

```
src/
  types.ts              — 类型定义
  db.ts                 — SQLite（sessions + messages）
  session-storage.ts    — pi-agent SessionStorage → SQLite
  session-runtime.ts    — SQLite-first headless runtime
  session-manager.ts    — session 生命周期、嵌入式 Agent
  builtin-extension.ts    — 内置默认 extension 实现（ask / git / utility）
  extensions/           — supervisor 专用 extension 系统
  extensions/builtin-extension/ — 内置默认 extension（loader 第一个加载）
  git-worktree.ts       — worktree 创建 / commit / merge
  utility-llm.ts        — utility 模型调用
  supervisor-settings.ts — ~/.pi/supervisor/settings.json
  rpc-mode.ts           — JSONL RPC headless 协议
  rpc-types.ts          — RPC 命令/响应类型
  http-server.ts        — Hono HTTP API
  cli.ts                — CLI 入口
  index.ts              — 公共导出 + startSupervisor()
```

## 核心概念

Supervisor **不解释** `meta` 里的阶段字段；SDD 编排器负责组合各阶段提示词，通过 `systemPrompt` 注入。

### sessions 表

| 字段 | 说明 |
|------|------|
| id | UUID，亦作为嵌入式 pi-agent session id |
| parent_id | 父 session ID（子代理树；fork/clone/spawn 均指向来源 session） |
| session_id | 与 id 相同（嵌入式模式） |
| pid | supervisor 进程 PID |
| leaf_id | 当前 session **entry 链**叶子（`messages.id`，非 session 树） |
| agent_id | 绑定的 Agent 定义（FK → `agents.id`） |
| status | starting / running / waiting_user / idle / finish / error（兼容旧值 stopped） |
| cwd | 工作目录 |
| branch_type | 内置：`spawn` / `fork` / `clone`（子会话如何产生；根会话为 NULL） |
| created_at / last_active_at | 时间戳（毫秒） |
| meta | JSON，**自定义**扩展（SDD 阶段、label、`turns` 等） |

### agents 表

Agent 是**可复用的模板定义**（system prompt、工具集、资源目录）。Session 通过 `agent_id` 引用；spawn 子会话可绑定不同 agent。**模型由 Provider 管理**，Agent 仅通过 `provider_id` 引用 Provider，运行时使用该 Provider 的激活模型。

| 字段 | 说明 |
|------|------|
| id | 主键（UUID 或自定义 slug，如 `frontend-dev`） |
| name | 显示名 |
| description | 可选描述 |
| provider_id | LLM provider（FK → `providers.id`） |
| system_prompt | 默认系统提示词 |
| tools_preset | `coding` / `readonly` / `none` |
| home_dir | Agent 专属资源目录，默认 `~/.pi/supervisor/agents/{id}/`；skills 位于 `{home_dir}/skills/` |
| meta | JSON，**自定义**扩展 |
| created_at / updated_at | 时间戳（毫秒） |

创建 Agent 时自动 `mkdir` `home_dir`。运行时资源加载：`~/.pi/agent/`（global）+ `home_dir`（agent）+ `<cwd>/.pi/`（project，按 session 的 `cwd`）。

### providers 表

LLM Provider 配置（API 类型、base URL、可用模型列表等）。Agent 通过 `provider_id` 引用；**激活模型属于 Provider**，同一时刻每个 Provider 仅有一个 `active_model_id`。

| 字段 | 说明 |
|------|------|
| id | 主键（如 `anthropic`、`openai`） |
| idx | 排序序号（唯一） |
| name | 显示名 |
| api_type | API 实现类型（如 `anthropic-messages`、`openai-compatible`） |
| base_url | 可选 API base URL |
| api_key | 可选密钥（也可走环境变量） |
| active_model_id | 当前激活模型（DB 列名 `default_model_id`） |
| is_enabled | 是否启用 |
| priority | 优先级（越高越靠前） |
| created_at / updated_at | 时间戳（毫秒） |

`models` 表存储 Provider 下所有可用 `(provider_id, model_id)`；其中恰好一个与 `active_model_id` 对应。

### messages 表

每一行 = pi-agent-core 的一条 **`SessionTreeEntry`**（不只「AI 一句话」，也包括 user 消息、tool result、compaction 等）。

| 字段 | 说明 |
|------|------|
| id | entry 主键（UUID） |
| session_id | 所属 session（FK → `sessions.id`，级联删除） |
| parent_id | **会话内** entry 链的上一条 id（与 `sessions.parent_id` 无关；pi 对话树） |
| type | entry 类型索引（与 `payload.type` 相同，便于 SQL 过滤） |
| payload | **完整 `SessionTreeEntry` 的 JSON 字符串**（见下文） |
| is_old | 内置：`1` = fork/clone 从父 session 拷贝的历史 |
| message_role | 从 `payload` 提取的可索引角色（`user` / `assistant` / `toolResult` 等） |
| search_text | 从 `payload` 提取的可搜索纯文本 |
| meta | JSON，**自定义**扩展 |
| created_at | 写入时间戳（毫秒） |

写入时由 `extractMessageSearchFields()` 从 `payload` 解析 `message_role` / `search_text`，并同步到 FTS5 虚拟表 `messages_fts`（全文搜索）。`payload` 仍是 source of truth；这两列 + FTS 是读优化。

**搜索 API**：`GET /messages/search?q=关键词&sessionId=&role=&limit=50` 返回 `{ messageId, sessionId, messageRole, searchText, isOld, createdAt, snippet }[]`。

#### payload 存什么？

**是的：`payload` 就是把一整条 pi session entry 序列化成 JSON 存进去。** 格式与 `packages/agent` 的 `SessionTreeEntry` 一致，supervisor 不做二次包装。

常见 `payload.type`：

| payload.type | 含义 |
|--------------|------|
| `message` | 用户 / 助手 / tool result（看 `message.role`） |
| `compaction` | 上下文压缩摘要 |
| `thinking_level_change` | thinking level 变更 |
| `model_change` | 模型切换 |
| `custom` / `custom_message` / `label` | 扩展条目 |

**用户消息示例**（`payload` 列内容）：

```json
{
  "id": "uuid-1",
  "type": "message",
  "parentId": null,
  "timestamp": "2026-05-30T08:00:00.000Z",
  "message": {
    "role": "user",
    "content": "重构 Button.vue",
    "timestamp": 1717000000000
  }
}
```

**助手 + tool call**：

```json
{
  "id": "uuid-2",
  "type": "message",
  "parentId": "uuid-1",
  "timestamp": "2026-05-30T08:00:01.000Z",
  "message": {
    "role": "assistant",
    "content": [
      { "type": "text", "text": "先读文件。" },
      { "type": "toolCall", "id": "call_abc", "name": "read", "arguments": { "path": "src/Button.vue" } }
    ],
    "timestamp": 1717000001000
  }
}
```

**tool result**（仍是 `type: "message"`，`role: "toolResult"`）：

```json
{
  "id": "uuid-3",
  "type": "message",
  "parentId": "uuid-2",
  "timestamp": "2026-05-30T08:00:02.000Z",
  "message": {
    "role": "toolResult",
    "toolCallId": "call_abc",
    "toolName": "read",
    "content": [{ "type": "text", "text": "..." }],
    "isError": false,
    "timestamp": 1717000002000
  }
}
```

`GET /sessions/:id/messages` 在 payload 字段之外额外返回 supervisor 列：`isOld`、`meta`、`createdAt`（不在 payload JSON 里）。

`messages.parent_id` 与 payload 内的 `parentId` 写入时保持一致，便于 SQL 回溯 entry 链；`sessions.leaf_id` 指向当前链的叶子 entry id。

### session.meta 中的 `turns`

每次 `prompt` 触发的 agent 运行（`agent_start` → `agent_end`）结束后，supervisor 会在 `meta.turns` 追加一条记录，汇总该轮工具调用涉及的文件变更（需 session 挂载 `edit` / `write` / `bash` 等工具）：

```json
{
  "change": "change-01-auth",
  "stage": "implement",
  "turns": [
    {
      "index": 0,
      "startedAt": 1715000000000,
      "endedAt": 1715000001200,
      "files": {
        "added": ["src/new-route.ts"],
        "modified": ["src/auth.ts"],
        "deleted": []
      }
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `index` | 该 session 内第几轮对话（从 0 递增） |
| `startedAt` / `endedAt` | 本轮起止时间戳（毫秒） |
| `files.added` | 本轮新增文件（`write` 写入前不存在） |
| `files.modified` | 本轮修改文件（`edit`，或覆盖已存在的 `write`） |
| `files.deleted` | 本轮删除文件（`bash` 中 `rm` 等，启发式解析） |

路径相对于 session `cwd`，尽量使用正斜杠。SDD 编排器写入的其他 `meta` 字段与 `turns` 共存；`updateMeta` 合并时不会覆盖已有 `turns` 数组。

## HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /sessions | 列出 session，`?status=` `?parentId=` |
| GET | /sessions/:id | 单个 session |
| GET | /sessions/:id/children | 子 session 列表 |
| GET | /sessions/:id/messages | 该 session 的对话条目（`messages` 表） |
| GET | /messages/search | 全文搜索对话，`?q=` 必填，`?sessionId=` `?role=` `?limit=` |
| POST | /sessions | 创建嵌入式 session |
| POST | /sessions/:id/prompt | 发送用户消息并返回 SSE 事件流 `{ "message": "..." }` |
| POST | /sessions/:id/steer | 对当前运行中的 turn 发送 steer `{ "message": "..." }` |
| POST | /sessions/:id/follow-up | 对当前运行中的 turn 追加 follow-up `{ "message": "..." }` |
| POST | /sessions/:id/abort | 中止当前运行中的 turn，不删除 runtime |
| POST | /sessions/:id/compact | 压缩 SQLite 会话上下文 `{ "customInstructions": "..." }` |
| POST | /sessions/:id/checkpoints | 创建存档点 `{ "label": "..." }` |
| GET | /sessions/:id/checkpoints | 列出存档点 |
| POST | /sessions/:id/rewind | 回滚到存档点 `{ "checkpointId": "..." }` |
| POST | /sessions/:id/commit | 显式 git commit `{ "message": "..." }` |
| POST | /sessions/:id/model | 切换模型 `{ "provider": "...", "modelId": "..." }` |
| POST | /sessions/:id/thinking-level | 切换 thinking level `{ "level": "low" }` |
| GET | /sessions/:id/state | headless 状态快照 |
| GET | /agents | 列出 Agent 定义 |
| GET | /agents/:id | 单个 Agent |
| GET | /agents/:id/resources | Agent 资源（global + agent 层，不含 project） |
| GET | /resources/global | Pi 全局资源目录 |
| GET | /sessions/:id/commands | 当前 session 的 slash 命令（skills + prompts） |
| POST | /sessions/:id/kill | 中止 session |
| POST | /sessions/:id/complete | 完成 git work session：合并 worktree 分支、`status=finish` |
| POST | /sessions/:id/send | 已废弃（嵌入式模式返回 409） |
| GET | /settings | 读取 supervisor 全局设置（utility 模型等） |
| PATCH | /settings | 更新 supervisor 全局设置 |
| PATCH | /sessions/:id/meta | 合并 meta |
| PUT | /sessions/:id/meta | 替换 meta |
| DELETE | /sessions/:id | 仅删 DB 记录 |

### POST /sessions 请求体

```json
{
  "cwd": "/path/to/project",
  "parentId": "optional-parent-uuid",
  "meta": { "change": "feat-auth", "stage": "test" },
  "systemPrompt": "… 由 SDD 组装 …",
  "instructions": "可选的首条用户消息",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "toolsPreset": "coding"
}
```

`toolsPreset` 默认 `coding`（与 `coding-agent` 内建工具对齐：read、bash、edit、write、grep、find、ls）。`readonly` 仅读探索；`none` 无工具（同时跳过 builtin-extension 的 ask 与 git work session）。也可传自定义 `tools` 数组覆盖。

### Utility 模型（低价任务）

配置文件：`~/.pi/supervisor/settings.json`

```json
{
  "utilityProvider": "openai",
  "utilityModelId": "gpt-4o-mini"
}
```

HTTP：`GET /settings`、`PATCH /settings`（字段 `utilityProvider`、`utilityModelId`）。

用于 builtin-extension 能力（未配置时相关步骤会跳过或回退）：

- 滚动上下文压缩（`agent_end` 后按 threshold）
- 自动 git commit message
- 首轮对话后自动生成会话标题

Provider API Key 与环境变量 / `providers` 表中的密钥解析方式与主模型相同。

### Git work session（根 session）

对**根 session**（无 `parentId`、非 `meta.builtin`）且在 git 仓库内 spawn 时：

1. 在 `{repo}/.pi/supervisor/worktrees/{sessionId}/` 创建 worktree
2. 分支名 `pi/session-{shortId}`
3. **显式** `POST /sessions/:id/commit` 提交变更（不再每轮对话自动 commit）
4. `POST /sessions/:id/complete`：合并 worktree 分支到默认分支（要求无未提交变更）→ 删除 worktree → `status=finish`

### Checkpoint / Rewind（会话存档与回滚）

不依赖 git commit，用于 Cursor/OMP 风格的“回退到某一刻”：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /sessions/:id/checkpoints | 创建存档点 `{ label? }`，保存当前对话叶子 + git stash 快照 |
| GET | /sessions/:id/checkpoints | 列出存档点 |
| POST | /sessions/:id/rewind | 回滚 `{ checkpointId }`，恢复代码状态与会话叶子 |
| POST | /sessions/:id/commit | 显式 git commit `{ message? }` |

存档点存储在 `meta.checkpoints`；回滚会写入 `customType=checkpoint-rewind` 审计条目。

`meta.git` 示例：

```json
{
  "git": {
    "repoRoot": "/path/to/repo",
    "worktreePath": "/path/to/repo/.pi/supervisor/worktrees/uuid",
    "branch": "pi/session-abcdef12",
    "baseBranch": "main",
    "worktreeEnabled": true,
    "turnCount": 3,
    "lastCommit": { "hash": "abc1234", "message": "pi: ..." }
  }
}
```

合并失败时 `status=error`，`meta.git.mergeError` 保留 worktree 供手动处理。非 git 目录或无 worktree 时 complete 仅标记 `finish`。

## CLI

```
pi-supervisor serve              # HTTP server（默认 3030）
pi-supervisor rpc                # JSONL RPC（stdin/stdout）
pi-supervisor print "message"    # 单次 headless prompt（HTTP 客户端）
pi-supervisor list               # 列出 session
pi-supervisor stop <id>          # 中止 session
pi-supervisor delete <id>        # 删除 session
pi-supervisor extensions list    # 列出 ~/.pi/agent/extensions 下的 entry
pi-supervisor extensions install <path>   # 复制到全局 extensions 目录（仅文件系统）
pi-supervisor extensions remove <id>

--port / -p   HTTP 端口
--db          SQLite 路径（默认 ~/.pi/supervisor.db）
--<flag>      extension 注册的 CLI flag（`pi.registerFlag`）
```

### Extension 系统（supervisor 专用）

与 `coding-agent` 的 extension **完全独立**：使用 `defineExtension()` + `ExtensionContext`，面向 HTTP / 多 session。

**内置默认 extension：`builtin-extension`**

- 源码：`src/extensions/builtin-extension/index.ts`，实现：`src/builtin-extension.ts`
- `discoverAndLoadExtensions()` **始终第一个加载**，早于 agent / 项目目录下的其它 extension
- 能力：ask 工具、`waiting_user` 状态、git work session、utility 模型压缩与命名
- SessionManager 在 per-session extension runtime 完全接入前，直接调用 `builtin-extension.ts`

扫描顺序（`discoverAndLoadExtensions`）：

1. `builtin-extension`（内置，打包在 supervisor 内）
2. `~/.pi/supervisor/agents/{agentId}/extensions/`
3. `{cwd}/.pi/supervisor/extensions/`

示例自定义 extension（`hello.ts` 同目录）：

```ts
import { defineExtension } from "@earendil-works/pi-supervisor";

export default defineExtension({
  name: "my-extension",
  setup(ctx) {
    ctx.on("session.start", async (event) => {
      ctx.log("info", `session started: ${event.sessionId}`);
    });
  },
});
```

`pi-supervisor extensions list/install/remove` 操作 agent 目录下的 extension 文件；内置 `builtin-extension` 不在 agent 目录中，由 loader 自动注入。

HTTP 命令端点 `POST /sessions/:id/commands` 仍待与 extension runtime 完整对接（见 `kimi.md`）。

### Agent 资源目录（文件夹即绑定）

每个 Agent 有独立 home，与 Pi 全局目录叠加；**不再使用** DB `extension_ids` 绑定 extension。

| 层级 | 路径 | 运行时加载 | HTTP/UI `layers` 展示 |
|------|------|------------|-------------------------|
| Pi 全局 | `~/.pi/agent/{skills,extensions,prompts}/` | 是 | `global` |
| Agent 专属 | `~/.pi/supervisor/agents/{agentId}/` | 是 | `agent` |
| 项目（session cwd） | `<cwd>/.pi/{skills,extensions,prompts}/` | 是（`includeProject: true`） | **否** |

创建 Agent 时自动 `mkdir` agent home。可选 `agents.home_dir` 覆盖默认路径。

- `GET /agents/:id/resources?cwd=` — 仅返回 `global` + `agent` 两层（不含 project）
- `GET /resources/global?cwd=` — Pi 全局目录内容

写入 `~/.pi/supervisor/agents/{id}/skills/foo/SKILL.md` 即绑定到该 Agent；写入 `~/.pi/agent/skills/` 则所有 Agent 可见。

### skills / prompts（显式调用）

运行时从 global + agent home + `<cwd>/.pi/` 发现（与 coding-agent 一致）。

- `/skill:<name>` — 注入到下一次用户消息
- `GET /sessions/:id/commands` — 当前 session 可用 slash 命令

### extensions

从目录扫描 entry（`.ts` / `.js` 或子目录 `index.ts`），**不读** `extensions` 表或 `agents.extension_ids`。

`pi-supervisor extensions install/remove` 只操作 `~/.pi/agent/extensions/`，不写 DB。

### spawn_agent（抽象 + 外部包注册）

Supervisor **不**默认注入 `spawn_agent`。编排包继承 `SpawnAgentToolProvider`，实现 `spawn()`，注册到 `SessionManager`：

```ts
import { startSupervisor, SpawnAgentToolProvider, type SpawnAgentRequest, type SpawnAgentResult, type SpawnAgentToolContext } from "@earendil-works/pi-supervisor"
import { registerDefaultSpawnTool } from "./db-spawn-agent-tool-provider.js" // 见 docs/supervisor/examples/

const { manager, stop } = startSupervisor({ port: 3030 })
registerDefaultSpawnTool(manager)

const root = await manager.spawn({ cwd: "/my/project", agentId: "frontend-dev" })
```

自定义编排只需一个类：

```ts
class WorkflowSpawn extends SpawnAgentToolProvider {
  async spawn(ctx: SpawnAgentToolContext, req: SpawnAgentRequest): Promise<SpawnAgentResult> {
    // 路由、校验、改写 meta ...
    const child = await ctx.spawner.spawn({ parentId: ctx.parentSessionId, agentId: req.agentId, cwd: ctx.cwd, ... })
    return { sessionId: child.id, status: child.status, agentId: req.agentId, name: "..." }
  }
}
manager.registerSpawnAgentToolProvider(new WorkflowSpawn())
```

参考 [`docs/supervisor/examples/db-spawn-agent-tool-provider.ts`](../../docs/supervisor/examples/db-spawn-agent-tool-provider.ts)。

`includeProject: true` 与 spawn 无关：只要 session 绑定了 `agentId`（主会话或子会话），运行时即加载 global + agent home + `<cwd>/.pi/`。

### tree / fork / clone 的真实场景（对照 coding-agent）

你在修线上故障时，通常会并行验证多个思路：

- `tree`：回到历史某个节点，从那里继续另一条排查路径（不破坏当前路径）。
- `fork`：从旧需求点分叉出一条“保守修复”会话，优先用于快速止血。
- `clone`：复制当前最佳路径，做高风险实验（如并发优化），失败可直接丢弃。

Supervisor 目前已有多 session 与父子关系能力，但没有 `coding-agent` 那种内建的 `/tree`、`/fork`、`/clone` 交互入口。若上层需要同等体验，可在 supervisor-web-ui 或编排层实现对应操作流。

**分支字段（内置列，不在 meta 里）**

| 操作 | sessions | messages |
|------|----------|----------|
| `spawn({ parentId })` | `branch_type=spawn`, `parent_id` 指向父 session | 无拷贝 |
| `fork(id, entryId)` | `branch_type=fork`, `parent_id` | 切点及之前拷贝行 `is_old=1` |
| `clone(id)` | `branch_type=clone`, `parent_id` | 全部拷贝行 `is_old=1` |

来源 session 通过 `sessions.parent_id` 推断，无需额外 id 列。`GET /sessions/:id/messages` 每条返回 `isOld` 字段；UI 可用 `isOld` 区分继承历史与本会话新消息。

## Playground 工作区

仓库根目录的 [`playground/`](../../playground/README.md) 用于本地开发与手动测试 supervisor 的 print、HTTP、RPC 三种 headless 用法。默认使用 `toolsPreset: "readonly"` 做冒烟测试，需要让 agent 改文件时改为 `"coding"`。详细步骤见 [`playground/TESTING_CN.md`](../../playground/TESTING_CN.md)。

MiniMax 可用以下环境变量：

- `MINIMAX_API_KEY` + `--provider minimax`
- `MINIMAX_CN_API_KEY` + `--provider minimax-cn`

示例命令：

```powershell
$env:MINIMAX_API_KEY="your-key"
pnpm run build
node packages/supervisor/dist/cli.mjs print "Open TASK.md and explain the change." --provider minimax --model MiniMax-M2.7 --cwd playground --db playground/.supervisor/supervisor.db
```

## Headless RPC

`pi-supervisor --mode rpc` 使用 JSONL stdin/stdout。核心命令兼容 `coding-agent` headless 语义的子集：

- `prompt`
- `steer`
- `follow_up`
- `abort`
- `compact`
- `set_model`
- `set_thinking_level`
- `get_state`
- `get_messages`

Supervisor 额外暴露 SDD 编排命令：

- `spawn_session`
- `list_sessions`
- `get_session`
- `get_children`
- `patch_meta`

示例：

```json
{"id":"1","type":"spawn_session","options":{"cwd":"/my/project","meta":{"stage":"implement"}}}
{"id":"2","type":"prompt","sessionId":"<session-id>","message":"Implement task 1.1"}
{"id":"3","type":"compact","sessionId":"<session-id>","customInstructions":"Keep implementation decisions"}
```

## 编程接口

```ts
import { startSupervisor } from "@earendil-works/pi-supervisor"

const { manager, stop } = startSupervisor({ port: 3030 })

const root = await manager.spawn({
  cwd: "/my/project",
  systemPrompt: "You are in brainstorm phase…",
  meta: { change: "change-01", stage: "brainstorm" },
})

const sub = await manager.spawn({
  parentId: root.id,
  cwd: "/my/project",
  systemPrompt: "Write tests only from specs…",
  meta: { change: "change-01", stage: "test" },
})

manager.onOutput(sub.id, (_id, event) => {
  if (event.type === "message_end") { /* … */ }
})

await manager.prompt(sub.id, "Implement task 1.1")
const history = await manager.getMessages(sub.id)

await manager.kill(sub.id)
await stop()
```

## 设计边界

- **阶段提示词** 由 `packages/sdd` 维护并注入 `systemPrompt`，supervisor 不读取阶段文件
- **子代理** 通过 `spawn({ parentId })` 创建，对话在 SQLite 中按 `messages.session_id` 隔离
- **会话存储** 是 SQLite-only，不读取、不写入、不导入 coding-agent JSONL
- `kill` 中止内存中的 Agent；`DELETE` 只删 DB 记录
- 默认工具使用 coding-agent 的 read / bash / edit / write / grep / find / ls；可用 `toolsPreset` 或 `tools` 覆盖
