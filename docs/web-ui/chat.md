# Chat 子系统

Chat 是整个 Web UI 最复杂的模块，涉及 20+ 组件和 4 个 Subsystem。

## 组件层级

```
ChatView.vue
├── ChatViewHeader.vue          ← 会话元数据（title / status / workspace / agent 等）
├── ChatMessageList.vue         ← 消息列表（虚拟滚动 + 自动滚到底部）
│   ├── UserMessageRow.vue      ← 用户消息（含文件附件）
│   ├── AssistantMessageGroup.vue ← AI 消息组
│   │   ├── ThinkingBlock.vue   ← 思考块（可展开/折叠）
│   │   ├── ToolStepRenderer.vue ← tool 调用步骤
│   │   │   ├── BashStep.vue    ← bash 工具输出
│   │   │   ├── AskStep.vue     ← ask 工具（等待用户回答）
│   │   │   │   └── AskStepOption.vue ← ask 选项列表
│   │   │   └── TurnFileChanges.vue ← 本轮文件变更
│   │   ├── ToolActivityBar.vue ← tool 调用进度条
│   │   └── ToolDetailModal.vue ← tool 详情弹窗
│   ├── CompactionBanner.vue    ← 上下文压缩提示条
│   └── ChatSearchBar.vue       ← 消息内搜索条
├── ChatComposer.vue            ← 输入框
│   ├── CodeMirrorEditor        ← CodeMirror 6 实例
│   └── ChatAutocompletePopup.vue ← `@`/`/` 自动补全弹出
├── ChatInputPanel.vue          ← 输入区容器（图片预览、工具栏）
│   └── ChatInputToolbar.vue    ← 发送按钮 + 动作按钮
└── ChatTagChip.vue             ← tag 组件
```

## 自动补全

`ChatAutocompletePopup.vue` 监听输入框内容：

- 输入 `@`：弹出文件补全（基于 `listWorkspaceFiles` API）
- 输入 `/`：弹出 skill / prompt 补全（基于 agent resources）

实现参考：`src/components/chat/ChatAutocompletePopup.vue`

## CodeMirror 集成

`src/codemirror/chat-input-tags.ts`：

- `chatInputTheme`：自定义主题（与暗/亮模式联动）
- `FileTagWidget` / `SkillTagWidget`：输入框中已选中的 file/skill 标签渲染

编辑器实例在 `ChatComposer.vue` 中通过 CodeMirrorView 使用。

## SSE 流式输出

`useSessionStore().promptSession()` 调用 `api.promptSession()`，建立 SSE 连接（`api/api.ts`）。事件逐条推入 messages tree，UI 自动增量渲染。

## 会话管理菜单

`ChatSessionMenu.vue` 提供侧滑菜单：

- Checkpoint / Rewind / Commit / Kill / Complete
- Session Log（跳转到 `SessionLogPanel`）

## 已知问题

- 中止 / Steer / Follow-up 按钮未实现（详见 [已知未实装功能](/web-ui/known-gaps)）
- `store/session.ts` 是 deprecated shim，应用级 store 在 `store/index.ts`
