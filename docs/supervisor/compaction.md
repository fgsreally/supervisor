# 上下文压缩

会话级滚动压缩实现于 `src/core/compaction/rolling.ts`，由 `src/core/session-lifecycle.ts` 在合适的生命周期节点调用。它不是 agent 可调用工具。

## 行为

- 按上下文用量检查是否需要压缩。
- 压缩后维护消息树与工具引用关系，避免断链。
- 可通过 `POST /sessions/:id/compact` 手动触发。

## 工具输出压缩

打包工具 `output-minimizer`（及部分工具的 after_call 钩子）用于压缩单次工具的过长输出，与会话级 rolling compaction 是两条路径。

## 相关

- [打包工具](/supervisor/builtin-tools)
- [HTTP API](/supervisor/http-api)
