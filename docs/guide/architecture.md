# 架构总览

Pi Supervisor 由两个包组成：

```
┌────────────────────────────┐        ┌──────────────────────────┐
│  supervisor-web-ui (Vue)   │        │  supervisor (Node.js)     │
│  ─────────────────────────  │  HTTP  │  ──────────────────────  │
│  Pinia store               │ ←────→ │  Hono HTTP API           │
│  api/api.ts (axios-like)   │        │  SessionManager          │
│  Chat / Settings / Resources│        │  SessionExtensionHost    │
└────────────────────────────┘        │  MCP Client              │
                                       │  SQLite (supervisor.db)  │
                                       └──────────────────────────┘
```

## 后端：`@earendil-works/pi-supervisor`

入口：`src/http/http-server.ts:1` 提供 Hono HTTP 服务器，路由见 [HTTP API 参考](/supervisor/http-api)。

### 核心模块

| 模块                 | 路径                                 | 职责                                          |
| -------------------- | ------------------------------------ | --------------------------------------------- |
| SessionManager       | `src/core/session-manager.ts:371`    | 创建、fork、clone、kill、complete、checkpoint |
| SessionRuntime       | `src/core/session-runtime.ts:133`    | prompt / steer / follow-up / abort            |
| SessionStorage       | `src/core/session-storage.ts:12`     | SQLite 持久化消息树                           |
| SupervisorDb         | `src/db/db.ts:96`                    | schema、迁移、FTS5 全文搜索                   |
| SessionExtensionHost | `src/core/session-extension/host.ts` | 激活扩展、事件分发、工具注入                  |
| MCP Extension        | `src/extension/builtin/mcp/index.ts` | Stdio + SSE MCP 服务器连接与工具注册          |
| Compaction           | `src/core/compaction/rolling.ts`     | 按上下文用量执行滚动压缩                      |

### 数据存储

- SQLite：`~/.pi/supervisor/supervisor.db`（schema 在 `src/db/db.ts:96-152`）
- Agent 工作目录：`~/.pi/supervisor/agents/<agent-id>/`（`src/agent/index.ts`）

## 前端：`@earendil-works/pi-supervisor-ui`

入口：`index.html` → `src/main.ts:1` → `App.vue:1`

### 主要模块

| 模块         | 路径                                                     | 职责                                         |
| ------------ | -------------------------------------------------------- | -------------------------------------------- |
| Router       | `src/router/index.ts:18`                                 | 7 个路由                                     |
| Pinia Stores | `src/store/index.ts:41`                                  | Root / Session / Agent / Provider / Resource |
| API Client   | `src/api/api.ts`                                         | 882 行，覆盖所有 HTTP 端点                   |
| Chat 子系统  | `src/views/ChatView.vue` + `src/components/chat/*`       | 对话、SSE 流式、autocomplete                 |
| Settings     | `src/views/ProviderDetailView.vue` / `AgentFormView.vue` | Provider/Agent 配置                          |
| Resources    | `src/components/SkillFileTree.vue` 等                    | Skills / Prompts / Extensions 浏览           |
| Composables  | `src/composables/*`                                      | 主题、推送通知、布局尺寸                     |

## 数据流

1. 用户在 Web UI 输入消息
2. `ChatInputPanel.vue` → `useSessionStore().promptSession()`
3. Store 调用 `api.promptSession(sessionId, message)`，开始 SSE
4. 后端 `http-server.ts` 收到 `POST /sessions/:id/prompt`，调 `SessionManager.prompt()`
5. SessionRuntime 调用底层 AgentHarness，逐条生成事件
6. 事件流回前端，store 更新 messages tree，UI 增量渲染

详细路由表见 [HTTP API 参考](/supervisor/http-api)。
