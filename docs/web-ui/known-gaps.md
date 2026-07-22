# 已知缺口

相对当前 Web UI 实现仍存在的缺口。Steer、Follow-up、停止按钮、Slash 命令与 Job UI 已接入，不再列入。

## 1. Thinking Level 切换

- `ThinkingBlock` 可展示思考内容
- 无 UI 选择 `thinking_level`（后端 `POST /sessions/:id/thinking-level` 已有）

## 2. 扩展管理页

- 无完整安装 / 更新 / 绑定管理界面
- CLI 与 HTTP `/extensions*` 可用

## 3. 工作流确认 / 选择面板

- `WorkflowStageTag` 可显示 stage/status
- 缺少 `waiting_confirmation` / `waiting_choice` 的专用面板

## 4. 独立 Search 页

- 路由 `/search` 重定向到 `/chat`
- `SearchView.vue` 若仍存在则为未挂路由的遗留文件；消息搜索走 Chat 内搜索与 `GET /messages/search`

## 5. E2E 稳定性

- Playwright 冒烟依赖 DOM 文本定位较多，缺少 `data-testid`，CI 较脆弱

## 6. deprecated shim

- `src/store/session.ts` 标 `@deprecated`；请使用 `src/store/index.ts` 导出的 store

## 总结

| 缺口                   | 严重度 |
| ---------------------- | ------ |
| Thinking Level UI      | 低     |
| 扩展管理页             | 低     |
| 工作流面板             | 中     |
| Search 死代码 / 重定向 | 低     |
| E2E data-testid        | 低     |
| store shim             | 低     |
