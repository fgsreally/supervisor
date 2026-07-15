# Shadow WebSocket 与建议输入任务

当前 Shadow XML 协议可以返回 `suggestion`，但后端暂不投递该字段。本任务负责建立实时投递与前端消费链路。

## 范围

- 用持久 WebSocket 替换现有 Session SSE 事件流。
- 建立 Agent 与 Supervisor 共用的 Session 事件通道。
- 新增 `shadow.suggestion` 事件，仅携带 Session ID、建议文本和事件时间。
- Web UI 收到建议后填入聊天输入框，但不得自动发送。
- 输入框已有用户内容时不得静默覆盖，需要定义合并或忽略策略。
- 支持断线重连、事件去重、Session 切换和标题实时更新。

## 边界

- `suggestion` 不写入会话消息，不进入主 LLM 上下文。
- Shadow 不直接向用户发送聊天消息。
- 本任务不为 Shadow 增加任何工具。
