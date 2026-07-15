# 上下文压缩

上下文压缩逻辑位于 `src/extensions/compaction/` 和 `src/extensions/rolling-compaction.ts`。

## 组成

- `micro.ts`：零 LLM 截断冗长工具输出。
- `origin.ts`：标记消息来源，区分真实用户输入和系统注入。
- `projector.ts`：压缩后修复工具引用关系。
- `rolling-compaction.ts`：每轮结束后检查是否需要压缩。

## 接入点

当前 rolling compaction 由 `src/core/session-lifecycle.ts` 在 `agent_end` 后调用。它不是 agent 可调用工具，也不依赖工具扩展强制加载。

## 工具输出压缩

可选扩展 `supervisor-agent-tools` 会通过 `tool.after_call` 压缩 bash 长输出。这属于扩展工具后处理，和会话级 rolling compaction 是两条路径。
