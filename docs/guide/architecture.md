# 架构总览

Pi Supervisor 由两个包组成：

```
┌────────────────────────────┐        ┌──────────────────────────┐
│  supervisor-web-ui (Vue)   │        │  supervisor (Node.js)     │
│  ─────────────────────────  │  HTTP  │  ──────────────────────  │
│  Pinia store               │ ←────→ │  Hono HTTP API           │
│  api/api.ts                │  SSE   │  SessionManager          │
│  Chat / Settings / Resources│        │  SessionExtensionHost    │
└────────────────────────────┘        │  Job / MCP / Subagent    │
                                       │  External agents         │
                                       │  SQLite (supervisor.db)  │
                                       └──────────────────────────┘
```

## 后端：`pi-supervisor`

入口：`src/cli.ts`（`serve` 等）与 `src/http/http-server.ts`（Hono）。路由见 [HTTP API](/supervisor/http-api)。

### 核心模块

| 模块               | 路径                             | 职责                                       |
| ------------------ | -------------------------------- | ------------------------------------------ |
| SessionManager     | `src/core/session-manager.ts`    | 会话、子会话、输入队列、重启协调           |
| JobManager         | `src/core/jobs.ts`               | 执行记录、定时计划、取消与输入             |
| SessionRuntime     | `src/core/session-runtime.ts`    | prompt / steer / follow-up / abort         |
| SessionWorkflow    | `src/core/session-workflow.ts`   | `meta.workflow = { stage, status }`        |
| Compaction         | `src/core/compaction/rolling.ts` | 滚动上下文压缩                             |
| External runtimes  | `src/core/external/`             | Codex / Claude / ACP 外部 Agent 会话       |
| SupervisorDb       | `src/db/db.ts`                   | schema、迁移、members、Job、输入队列、FTS5 |
| Extension host     | `src/extension/runtime/`         | 激活扩展、事件、工具注入                   |
| Builtin extensions | `src/extension/builtin/`         | mcp、subagent、shadow、timer、循环守卫等   |
| Packaged tools     | `src/tools/`                     | ask、edit、lsp、web、browser 等可选工具    |

### 数据存储

- SQLite：默认 `~/.pi/supervisor.db`（playground 场景见根 `pnpm run serve`）
- Agent 工作目录：`~/.pi/supervisor/agents/<agent-id>/`

## 前端：`pi-supervisor-ui`

入口：`index.html` → `src/main.ts` → `App.vue`

| 模块       | 路径                                              | 职责                           |
| ---------- | ------------------------------------------------- | ------------------------------ |
| Router     | `src/router/index.ts`                             | chat / contacts / providers 等 |
| Pinia      | `src/store/`                                      | Session / Agent / Provider 等  |
| API Client | `src/api/api.ts`                                  | HTTP + SSE                     |
| Chat       | `src/views/ChatView.vue` + `src/components/chat/` | 对话、steer/follow-up、slash   |

## 数据流

1. 用户在 Web UI 输入消息
2. `ChatView` / 输入面板直接调用 API，并由 store 维护持久化会话状态
3. `POST /sessions/:id/prompt`（或对应端点），并订阅 `GET /sessions/:id/events` SSE
4. `SessionManager` / `SessionRuntime` 驱动 harness，事件回写消息树
5. 前端增量渲染；扩展可注入工具、命令与工作流状态

## 相关文档

- [Supervisor 概览](/supervisor/overview)
- [会话管理](/supervisor/session)
- [工作流](/supervisor/workflow)
- [扩展框架](/supervisor/extensions)
- [外部 Agent](/supervisor/external-agents)
