# Agent 工具

supervisor 核心默认只提供 pi 原生 4 个工具：

- `read`
- `bash`
- `edit`
- `write`

除此之外的 agent 工具都必须由扩展注册或覆盖。

## 可选工具扩展

仓库随包提供 `supervisor-agent-tools` 扩展，入口为 `src/extensions/agent-tools/index.ts`。它不会自动加载。

该扩展当前提供：

- `ask`：向用户提问，并通过 `POST /sessions/:id/ask-answer` 等待回答。
- `read_pattern`：按范围、模式或跨文件搜索读取内容。
- `lsp`：TS/JS/Python/Go 的 symbols、definition、references、diagnostics，TS/JS 支持 rename。
- `edit`：覆盖默认 edit，提供 anchor-based replacement 和可选审批。
- `ast_grep`：依赖 `@ast-grep/napi`，可用时注册结构化搜索、摘要、改写。
- `tool.after_call` 输出压缩：压缩 bash 的长输出。

## 非工具逻辑

`src/core/session-lifecycle.ts` 保留会话生命周期逻辑，例如 git worktree、agent end 后的自动命名、结束时 git 合并。这些不是 agent 可调用工具。
