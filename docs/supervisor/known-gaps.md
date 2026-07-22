# 已知缺口

以下为相对当前实现仍真实存在的缺口。已修复项（CLI、`/commands`、members 表、旧 dead code 路径等）不再列出。

## 1. Web UI 缺少 Abort 按钮

后端 `POST /sessions/:id/abort` 与 `api.abortSession` 已就绪；Chat 输入区已支持 steer / follow-up，但运行中仍缺少显式「中止」按钮。

## 2. Thinking Level 切换 UI

后端 `POST /sessions/:id/thinking-level` 已实现；Web UI 可展示思考块，但没有选择器切换 `thinking_level`。

## 3. 扩展管理 UI

HTTP `/extensions*` 与 CLI catalog/bind 已可用；Web UI 尚无完整的扩展安装 / 绑定管理页（资源页可浏览部分资源）。

## 4. 完整工作流面板

`meta.workflow` 与 `GET/PATCH/DELETE /sessions/:id/workflow` 已落地；UI 仅有 stage 标签。`waiting_confirmation` / `waiting_choice` 的完整确认与选择面板未做（Strict SDD 亦依赖此能力）。

## 5. Shadow suggestion 实时通道

Shadow 扩展与消息展示已可用；基于 WebSocket 的 suggestion 实时投递未实现，当前走 SSE / 消息写入路径。

## 总结

| 缺口              | 严重度 | 阻塞上线                  |
| ----------------- | ------ | ------------------------- |
| Abort 按钮        | 中     | 否（可用 API / 其他手段） |
| Thinking Level UI | 低     | 否                        |
| 扩展管理 UI       | 低     | 否（CLI / HTTP 可用）     |
| 工作流面板        | 中     | 否（API 可推进）          |
| Shadow WebSocket  | 低     | 否                        |

前端对应条目见 [Web UI 已知缺口](/web-ui/known-gaps)。
