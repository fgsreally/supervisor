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
│   ├── ShadowMessageRow.vue（如有）
│   └── CompactionBanner.vue
├── ChatInputPanel.vue / ChatComposer
│   ├── `@` / `/` 自动补全
│   └── 运行中发送模式：steer | follow_up
└── WorkflowStageTag（会话工作流标签）
```

## 运行中干预

`ChatView.vue` 在会话运行时可选择：

- **steer**：`api.steerSession` → `POST /sessions/:id/steer`
- **follow_up**：`api.followUpSession` → `POST /sessions/:id/follow-up`

Abort API（`api.abortSession`）已封装，UI 按钮见 [已知缺口](/web-ui/known-gaps)。

## Slash 命令

输入 `/` 时拉取 `GET /sessions/:id/commands`，执行走 `POST /sessions/:id/commands`（`api.getSessionCommands` / `executeSessionCommand`）。

## SSE

`promptSession` 等建立 SSE（`GET /sessions/:id/events`），事件推入消息树后增量渲染。

## 会话菜单

`ChatSessionMenu`：Checkpoint / Rewind / Commit / Kill / Complete、Session Log 等。

## 相关缺口

- 无 Abort 按钮、无 Thinking Level 选择器、无完整工作流面板 — 见 [已知缺口](/web-ui/known-gaps)
