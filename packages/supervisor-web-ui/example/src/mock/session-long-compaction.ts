import type { MockEntry } from "./types";

/** Structured summary format from pi compaction (see packages/coding-agent/docs/compaction.md). */
const compactionSummary = `## Goal
将 supervisor-web-ui 重构为 Vue 3 + 微信 PC 风格；example 用 Mock 数据演示多 session、子代理树、工具条与上下文压缩。

## Constraints & Preferences
- 工具展示：仅提示「调用了什么」，详情用弹窗
- bash 命令常显，输出不单独占行
- 对齐 supervisor SessionTreeEntry（含 compaction）

## Progress
### Done
- [x] 三栏布局与会话树（cwd 分组 + parentId 子代理）
- [x] read / write / edit / bash / spawn_agent 分开展示
- [x] 单气泡合并 assistant 轮次

### In Progress
- [ ] 长会话 compaction 示例与 UI
- [ ] 对接真实 GET /sessions/:id/messages

### Blocked
- 无

## Key Decisions
- **Mock 按 sessionId 分文件**：便于演示不同场景
- **压缩后从 firstKeptEntryId 继续**：与 pi 会话树一致

## Next Steps
1. 完成 compaction 横幅与摘要弹窗
2. 主包 ChatView 复用同一套组件

## Critical Context
- supervisor 将 pi 会话条目存入 SQLite messages 表
- 超过 contextWindow - reserveTokens 时自动 compact（默认 reserve 16k）

<read-files>
packages/supervisor-web-ui/example/src/views/ChatView.vue
packages/supervisor-web-ui/example/src/utils/flatten-messages.ts
packages/supervisor/SUPERVISOR.md
packages/coding-agent/docs/compaction.md
</read-files>

<modified-files>
packages/supervisor-web-ui/example/src/App.vue
packages/supervisor-web-ui/example/src/mock/messages.ts
</modified-files>`;

/**
 * 长会话：多轮工具调用后触发 threshold 压缩，再继续对话。
 * 对应 supervisor 返回的 compaction 类型 SessionTreeEntry。
 */
export const session4Messages: MockEntry[] = [
  {
    id: "s4-sys",
    type: "system",
    content: "Thinking level: high · context window 200k",
  },
  {
    id: "s4-u1",
    type: "message",
    message: {
      role: "user",
      content:
        "请系统性地重构 `supervisor-web-ui`：Vue 3、微信风格、对接 supervisor HTTP API。先通读 `SUPERVISOR.md` 和现有 Lit 代码，列出模块边界再动手。",
    },
  },
  {
    id: "s4-a1",
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "先 **read** 文档与入口文件，理清路由和 session 列表 API。" },
        {
          type: "toolCall",
          id: "s4-call-read-doc",
          name: "read",
          arguments: { path: "packages/supervisor/SUPERVISOR.md", offset: 1, limit: 120 },
        },
      ],
    },
  },
  {
    id: "s4-r1",
    type: "toolResult",
    toolCallId: "s4-call-read-doc",
    toolName: "read",
    content: [
      {
        type: "text",
        text: "# Supervisor\n\nHTTP API: GET /sessions, GET /sessions/:id/messages\nPOST /sessions/:id/compact ...\n",
      },
    ],
  },
  {
    id: "s4-a2",
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "s4-call-read-app",
          name: "read",
          arguments: { path: "packages/supervisor-web-ui/src/App.vue" },
        },
      ],
    },
  },
  {
    id: "s4-r2",
    type: "toolResult",
    toolCallId: "s4-call-read-app",
    toolName: "read",
    content: [{ type: "text", text: "<!-- legacy lit shell -->\n" }],
  },
  {
    id: "s4-u2",
    type: "message",
    message: {
      role: "user",
      content:
        "example 目录先做纯 Mock，要覆盖多 workspace、子代理树、read/write/edit/bash，不要接真 API。",
    },
  },
  {
    id: "s4-a3",
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "在 `example/` 下搭 Vite + Vue，并 **write** 会话树组件骨架。" },
        {
          type: "toolCall",
          id: "s4-call-write-tree",
          name: "write",
          arguments: {
            path: "packages/supervisor-web-ui/example/src/components/SessionTreeNode.vue",
            content: "<!-- SessionTreeNode placeholder -->\n",
          },
        },
      ],
    },
  },
  {
    id: "s4-r3",
    type: "toolResult",
    toolCallId: "s4-call-write-tree",
    toolName: "write",
    content: [
      {
        type: "text",
        text: "Wrote packages/supervisor-web-ui/example/src/components/SessionTreeNode.vue",
      },
    ],
  },
  {
    id: "s4-a4",
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "s4-call-ls",
          name: "bash",
          arguments: {
            intent: "列出 example 源码目录",
            command: "ls -la packages/supervisor-web-ui/example/src",
          },
        },
      ],
    },
  },
  {
    id: "s4-r4",
    type: "toolResult",
    toolCallId: "s4-call-ls",
    toolName: "bash",
    content: [{ type: "text", text: "App.vue\ncomponents/\nmock/\nutils/\nviews/\nexit code: 0" }],
  },
  {
    id: "s4-u3",
    type: "message",
    message: {
      role: "user",
      content:
        "继续把 ChatView 做好：合并 AI 气泡、Markdown、工具条点击弹窗。多给几个 session 的 mock 数据。",
    },
  },
  {
    id: "s4-a5",
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "**edit** ChatView，并 **read** 已有 mock 结构。" },
        {
          type: "toolCall",
          id: "s4-call-edit-chat",
          name: "edit",
          arguments: {
            path: "packages/supervisor-web-ui/example/src/views/ChatView.vue",
            old_string: "gap-6",
            new_string: "gap-3",
          },
        },
      ],
    },
  },
  {
    id: "s4-r5",
    type: "toolResult",
    toolCallId: "s4-call-edit-chat",
    toolName: "edit",
    content: [{ type: "text", text: "Applied 1 edit.\n" }],
  },
  {
    id: "s4-a6",
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "s4-call-test",
          name: "bash",
          arguments: {
            intent: "构建 example 前端以验证改动",
            command: "cd packages/supervisor-web-ui/example && npm run build",
          },
        },
      ],
    },
  },
  {
    id: "s4-r6",
    type: "toolResult",
    toolCallId: "s4-call-test",
    toolName: "bash",
    content: [{ type: "text", text: "✓ built in 4.2s\nexit code: 0" }],
  },
  {
    id: "s4-u4",
    type: "message",
    message: {
      role: "user",
      content:
        "会话已经很长了吧？如果上下文快满了，pi 会自动 compact。请说明压缩后你怎么继续，并加一个 compaction 的 example session。",
    },
  },
  {
    id: "s4-a7",
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "当前估算已接近阈值。若触发 **compaction**，较早的消息会写入 `CompactionEntry.summary`，从 `firstKeptEntryId` 起保留原文；我仍能看到摘要里的 Goal / Progress / 文件列表。",
        },
      ],
    },
  },
  // --- compaction (threshold); messages above are not sent to LLM after reload ---
  {
    id: "s4-compact-1",
    type: "compaction",
    reason: "threshold",
    tokensBefore: 118_420,
    firstKeptEntryId: "s4-u4",
    summary: compactionSummary,
    details: {
      readFiles: [
        "packages/supervisor/SUPERVISOR.md",
        "packages/supervisor-web-ui/src/App.vue",
        "packages/coding-agent/docs/compaction.md",
      ],
      modifiedFiles: [
        "packages/supervisor-web-ui/example/src/views/ChatView.vue",
        "packages/supervisor-web-ui/example/src/components/SessionTreeNode.vue",
      ],
    },
  },
  // --- kept messages (from firstKeptEntryId) ---
  {
    id: "s4-u4b",
    type: "message",
    message: {
      role: "user",
      content: "（压缩后）好，按摘要里的 Next Steps，把 compaction 示例 session 和横幅 UI 做完。",
    },
  },
  {
    id: "s4-a8",
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "根据摘要，我会新增 `session-4` 与 `CompactionEntry` 类型的 mock，并在聊天流中插入压缩分隔条。",
        },
        {
          type: "toolCall",
          id: "s4-call-read-compact-doc",
          name: "read",
          arguments: { path: "packages/coding-agent/docs/compaction.md", offset: 1, limit: 80 },
        },
      ],
    },
  },
  {
    id: "s4-r7",
    type: "toolResult",
    toolCallId: "s4-call-read-compact-doc",
    toolName: "read",
    content: [
      { type: "text", text: "## Compaction\n\ncontextTokens > contextWindow - reserveTokens\n" },
    ],
  },
  {
    id: "s4-a9",
    type: "message",
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "已添加 **session-4（Long Session · 含上下文压缩）**。刷新后可在列表选中查看：压缩前多轮工具、中间压缩条、压缩后继续的对话。",
        },
      ],
    },
  },
];
