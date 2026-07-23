# Chat 子系统

Chat 是 Web UI 最复杂的模块，覆盖消息流、工具渲染与运行中干预。

## 组件层级

```
ChatView.vue
├── ChatViewHeader.vue
├── ChatMessageList.vue
│   ├── UserMessageRow.vue
│   ├── AssistantMessageGroup.vue
│   │   ├── ThinkingBlock.vue
│   │   ├── ToolStepRenderer.vue
│   │   └── …
│   ├── LlmErrorCard.vue（`customType: llm_error`，可 retry）
│   ├── ShadowMessageRow.vue（如有）
│   ├── 日期分割线样式的 `custom_message` notice
│   └── CompactionBanner.vue
├── ChatInputPanel.vue / ChatComposer
│   ├── `@` / `/` 自动补全
│   ├── 运行中发送模式：steer | follow_up
│   └── 运行时停止按钮
├── SessionJobsPopover（定时计划、后台执行与详情）
└── WorkflowStageTag（会话工作流标签）
```

## 运行中干预

`ChatView.vue` 在会话运行时可选择：

- **steer**：`api.steerSession` → `POST /sessions/:id/steer`
- **follow_up**：`api.followUpSession` → `POST /sessions/:id/follow-up`

运行时发送按钮变成停止图标并调用 `api.abortSession`。如果该轮尚未出现 assistant 输出，后端会撤回最新 user message，前端将文本放回输入框；已经出现输出时只中断当前 Turn。

## Slash 命令

输入 `/` 时拉取 `GET /sessions/:id/commands`，执行走 `POST /sessions/:id/commands`（`api.getSessionCommands` / `executeSessionCommand`）。

## SSE

`promptSession` 等建立 SSE（`GET /sessions/:id/events`），事件推入消息树后增量渲染。会话输出中的 `ui_notify` 以 toast（`showUiMessage`）展示，不改变 session status。

打开会话时调用 `POST /sessions/:id/read` 清除未读；列表项用 `meta.unread` 显示角标。

## 会话菜单

`ChatSessionMenu`：Checkpoint / Rewind / Commit / Kill / Complete、Session Log 等。

Shadow 在菜单中只有启用/禁用开关，不提供 Agent 选择。可用子代理仍单独配置。

## 相关缺口

- 无 Thinking Level 选择器、无完整工作流面板 — 见 [已知缺口](/web-ui/known-gaps)
