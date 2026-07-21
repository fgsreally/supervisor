# 打包工具

默认工具由 `src/utils/default-tools.ts` 的 `toolsPreset` 决定，**不是**扩展：

| Preset    | 工具 |
| --------- | ---- |
| `coding`  | pi `createCodingTools`（read / bash / edit / write）+ grep / find / ls |
| `readonly`| pi `createReadOnlyTools` |

额外能力以 **打包工具**（`src/tools/`）形式按 Agent 资源配置启用，ID 定义于 `PACKAGED_TOOL_IDS`：

| ID                   | 说明 |
| -------------------- | ---- |
| `ask`                | 向用户提问，经 `POST /sessions/:id/ask-answer` 等待回答 |
| `edit`               | 覆盖默认 edit（anchor 替换等） |
| `lsp`                | 语言服务：symbols / definition / references / diagnostics |
| `ast-grep`           | 结构化搜索与改写（依赖 `@ast-grep/napi`） |
| `web`                | web_search + web_fetch（provider 见 settings / `config` CLI） |
| `browser`            | 浏览器自动化 |
| `computer-use`       | 桌面计算机使用 |
| `desktop-recording`  | 桌面录制 |
| `output-minimizer`   | 压缩过长工具输出 |

激活入口：`src/tools/catalog.ts` 的 `activatePackagedTool`。

## 非工具逻辑

`src/core/session-lifecycle.ts` 中的 worktree、自动命名、结束合并、触发 rolling compaction 等属于会话生命周期，不是 agent 可调用工具。

扩展仍可通过 `ctx.agent.tools.register` 注册自定义工具，见 [扩展框架](/supervisor/extensions)。
