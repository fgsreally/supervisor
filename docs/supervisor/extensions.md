# 扩展 API

扩展是按 Session 实例化的 TypeScript/JavaScript 模块。公开类型的权威来源是
`packages/supervisor/src/extension/types.ts`，运行时装配位于 `extension/runtime/context.ts`。

## 包与加载

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "type": "module",
  "main": "./index.ts",
  "repository": "github:acme/my-extension"
}
```

`main` 缺省时依次尝试 `index.ts`、`index.js`。入口默认导出 `defineExtension(...)`：

```ts
import { defineExtension, Type } from "pi-supervisor";

export default defineExtension({
  name: "demo",
  setup(ctx) {
    ctx.agent.registerTool({
      name: "ping",
      description: "Return the current session ID",
      parameters: Type.Object({}),
      async execute() {
        return { content: [{ type: "text", text: String(ctx.session.id) }] };
      },
    });
    return () => ctx.agent.unregisterTool("ping");
  },
});
```

`setup` 可同步或异步，并可返回同步/异步清理函数。不要使用旧的 `ctx.runtime`、
`ctx.cwd`、`ctx.projectDir`、`ctx.sessionId` 或 `ctx.agent.tools`；这些对象已不在公开 API 中。

安装来源支持本地路径、npm 与 GitHub。扩展作为 `resources(kind=extension)` 安装到全局 catalog，
再通过 `agent_resources` bind 到 Agent；Session 不扫描 cwd 或 Agent Home 来发现扩展。

```bash
pi-supervisor extensions install ./my-extension
pi-supervisor extensions bind <agent-id> <extension-resource-id>
pi-supervisor extensions update <extension-resource-id>
```

## `ExtensionContext`

| 成员                  | 用途                                                    |
| --------------------- | ------------------------------------------------------- |
| `session`             | 当前会话、消息、meta、stage、派生 Session 与上下文操作  |
| `agent`               | 当前 Agent 信息、工具/slash 注册、模型与 thinking level |
| `tools`               | 枚举或调用当前 Session 已注册的扩展工具                 |
| `jobs`                | 创建、查询、更新、取消执行记录及输入/取消 handler       |
| `project`             | 项目 `cwd` 与专属 `dir`                                 |
| `ui`                  | WebSocket 广播与用户审批                                |
| `db`                  | 原始 SQLite；扩展自行保证完整性与迁移安全               |
| `watson`              | 使用助手模型运行临时内部任务，不创建用户 Session        |
| `flow`                | continue/pause/resume、锁和 usage scope                 |
| `inject`              | 在 turn 边界 schedule/reattach/clear prompt 注入        |
| `events`              | 扩展间事件总线                                          |
| `on` / `log` / `exec` | 生命周期订阅、日志、进程执行                            |

### `ctx.session`

只读身份：`id`、`cwd`、`dir`、`isMain`、`isChild`、`signal`。

- `meta.get/set/patch`：Session 扩展状态。扩展键必须带自己的命名空间。
- `workflow.get/set/clear`：旧兼容名；当前只是 `sessions.stage` 的薄层，status 恒为
  `working`。新扩展不应在这里保存 waiting/completed 等状态。
- `tasks.list/upsert/remove/getCurrentPath/setCurrentPath`：`sessions.meta.tasks/currentTask`。
- `todos.list/replace`：`sessions.meta.todos`。
- `messages.list/get/tree/currentBranch/search/getMeta/setMeta/patchMeta/setLabel/stats/contextUsage`。
- `tools.beforeUse/afterUse/enable/disable/setActive/getActive`：当前会话的工具策略。
- `spawn`、`sendToChild`、`inspectChild`、`waitForResult`、`finish`：子 Agent 协作。
- `fork`、`switchTo`、`navigateTree`、`compact`：会话树与上下文操作。
- `appendEntry`、`sendMessage`、`sendUserMessage`：持久消息；`sendCustomMessage` 只写 timeline，
  不进入 LLM 上下文。
- `isIdle/isStreaming/abort/waitForIdle/pausing/getParent/children/getDir`：运行状态与目录。

资源产物必须写到正确专属目录：Session 级使用 `ctx.session.dir`，Project 级使用
`ctx.project.dir`，不能因为 `ctx.project.cwd` 可用就把缓存或录制产物写入源码目录。

### `ctx.agent`

身份字段为 `id`、`name`、`providerId`、`modelId`、`systemPrompt`、`model`。

`registerTool/unregisterTool` 注册工具；`registerSlash/unregisterSlash` 注册 slash。
`registerCommand/unregisterCommand` 是 slash 的兼容别名。另有 `listTools/getTool`、
`setModel`、`setThinkingLevel/getThinkingLevel`。

`findByRole("spawned")` 解析 `sessions.meta.subagentIds`。`findByTag` 是旧兼容入口，
当前返回空列表，新扩展应显式使用 Session 的可委派 Agent 白名单。

### 工具定义

```ts
ctx.agent.registerTool({
  name: "read_note",
  description: "Read a session note",
  parameters: Type.Object({ path: Type.String() }),
  promptSnippet: "Use read_note for session-owned notes.",
  promptGuidelines: ["Paths are relative to the session directory."],
  executionMode: "parallel",
  async execute(params, { toolCallId, session, signal, reportProgress }) {
    reportProgress({ message: "reading", percent: 50 });
    return {
      content: [{ type: "text", text: params.path }],
      details: { toolCallId, session, aborted: signal?.aborted ?? false },
    };
  },
});
```

返回值必须包含 `content`，其 block 为 `{ type: "text", text }` 或
`{ type: "image", url }`；可选 `details` 与 `isError`。参数 schema 使用导出的 TypeBox
`Type`。不要直接传旧 pi agent 的三参数 `execute(toolCallId, params, signal)`，需要像上例适配。

### Slash 定义

`registerSlash(name, definition)` 接受二选一：

- `template: string | (args) => string`：展开为 prompt；
- `handler(args, { sessionId, cwd })`：返回 `handled`、`prompt`、`error` 或 void。

公共字段为 `description`、`source`（`skill|prompt|custom`）、`icon` 与
`arguments`（`none` 或带 required/placeholder 的 `text`）。

### Jobs、华生与原始数据库

`ctx.jobs` 提供 `create/get/list/update/cancel/input`，以及
`setCancelHandler/setInputHandler`。它面向系统执行记录，不是 LLM 工具表面；定时定义应写
`sessions.meta.timers`，触发实例才创建 Job。

`ctx.watson.run(...)` 使用 `featureModels.assistant`，支持两种调用方式：

- `mode: "simple"`：只请求模型一次。
- `mode: "agent"`：使用 AgentHarness，多轮调用工具后结束。

两种方式都可传 TypeBox `resultSchema`。传入后，华生要求模型通过 `submit_result` 提交并校验
结构化结果；不传则返回文本。日志统一写入华生日志目录。

`ctx.db.available` 可先检查原始数据库是否可用，再使用 `prepare/query/queryOne/execute`。
核心表没有扩展迁移隔离，优先使用高层 facade；自定义数据推荐 namespaced meta 或扩展自有表。

## 事件

使用 `const off = ctx.on("event.name", handler)`，清理函数中调用 `off()`。

| 分组      | 当前事件                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------- |
| Session   | `session.prepare`、`session.start`、`session.before_complete`、`session.end`                      |
| 工作流    | `workflow.stage_changed`；`workflow.status_changed` 仅为兼容类型                                  |
| 消息      | `message.user`、`message.assistant`、`message.tool_call`、`message.tool_result`、`message.custom` |
| Agent     | `agent.start`、`agent.end`、`agent.error`、`agent.abort`                                          |
| Turn      | `turn.started`、`turn.ended`、`step.ended`                                                        |
| 工具      | `tool.before_call`、`tool.after_call`                                                             |
| 压缩/模型 | `compact.before`、`compact.after`、`model.change`                                                 |
| HTTP/WS   | `http.request`、`http.response`、`ws.connect`、`ws.disconnect`、`ws.message`                      |
| 扩展      | `extension.reload`、`extension.error`                                                             |

工具 guard 优先使用 `ctx.session.tools.beforeUse/afterUse`；它提供明确的 allow/block 与结果替换
契约。事件适合观察跨组件生命周期。

## 内置扩展

当前 catalog 为 `supervisor-admin`、`eval`、`task-management`、`tool-loop-guard`、`timer`、
`persistent-bash`、`skill`、`mcp`、`message-assets`、`subagent`。内置扩展也以
`resources.meta.builtin = true` 表示；`subagent` 只加载到主 Session。

`supervisor-admin` 仅绑定到内置 Pi 助手，提供受控 HTTP、数据库和扩展脚手架工具；详见
[Pi 管理助手](/supervisor/intro-assistant)。

仓库根目录下的可选扩展及兼容状态见[仓库扩展](/supervisor/shipped-extensions)。
