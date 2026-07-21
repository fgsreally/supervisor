# Shadow

Shadow 是旁路观察协作者：在主会话轮次结束后分析上下文（记忆、安全等），必要时向父会话投递消息。实现为内置扩展 `src/extension/builtin/shadow/`，并配有内置 Shadow Agent（`agents/shadow/prompt.md`，`is_internal`，不可用于创建普通用户会话）。

## 行为概要

- 主会话空闲 / 轮次结束后由扩展触发 `runShadow`。
- 协议提示与解析见 `protocol.ts`；记忆读写见 `memory.ts`。
- Web UI 用 `ShadowMessageRow` 等组件展示 Shadow 消息。

主会话事件流仍为 **SSE**（`GET /sessions/:id/events`），不是 WebSocket。

## 已知后续

Shadow suggestion 的实时 WebSocket 投递尚未实现；当前依赖现有 SSE / 消息写入路径。见 [已知缺口](/supervisor/known-gaps)。

## 相关

- [子代理](/supervisor/subagents)
- [扩展框架](/supervisor/extensions)
