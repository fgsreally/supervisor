# Shadow

Shadow 是旁路观察协作者：在主会话轮次结束后分析上下文（记忆、安全等），必要时向父会话投递消息。实现位于 `src/extension/builtin/shadow/`，使用不可创建普通会话的内置 Shadow Agent。

## 行为概要

- 主会话空闲 / 轮次结束后由扩展触发 `runShadow`。
- 协议提示与解析见 `protocol.ts`；记忆读写见 `memory.ts`。
- Web UI 用 `ShadowMessageRow` 等组件展示 Shadow 消息。
- Web UI 只允许启用或禁用 Shadow，不允许为单个 Session 选择其他 Agent。
- 开关持久化为 `session.meta.shadowDisabled`；启用时使用系统内置 Shadow Agent。

主会话事件流仍为 **SSE**（`GET /sessions/:id/events`），不是 WebSocket。

## 相关

- [子代理](/supervisor/subagents)
- [扩展框架](/supervisor/extensions)
