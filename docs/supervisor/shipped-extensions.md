# 仓库扩展

仓库 `extensions/` 下提供可选扩展包，需安装到全局 catalog 并 bind 到 Agent 后才会在会话中加载。

## 安装

```bash
pnpm run build
node packages/supervisor/dist/cli.mjs extensions install ./extensions/strict-sdd
node packages/supervisor/dist/cli.mjs extensions bind <agent-id> <extension-id>
node packages/supervisor/dist/cli.mjs extensions list
```

也可用 HTTP：`POST /extensions/install` 等，见 [HTTP API](/supervisor/http-api)。

## strict-sdd

路径：`extensions/strict-sdd`

严格阶段式开发流水线（Brainstorm → … → Archive）。状态写入 `session.meta.workflow`；详细执行数据可落在 Session 目录 `workflow/`。说明见扩展内 `README.md`，概念见 [工作流](/supervisor/workflow)。

## hindsight

路径：`extensions/hindsight`

长期记忆扩展。配置 `HINDSIGHT_API_URL` 走远程 API，否则可回退本地 JSONL。详见扩展 `README.md`。

## native

路径：`extensions/native`

用 Rust/原生能力增强或覆盖部分工具路径。详见扩展 `README.md`。

## 与内置扩展的区别

| 类型     | 位置                                         | 启用方式                      |
| -------- | -------------------------------------------- | ----------------------------- |
| 内置     | `packages/supervisor/src/extension/builtin/` | 核心按绑定/会话需要激活       |
| 仓库扩展 | `extensions/*`                               | `extensions install` + `bind` |

通用 DSL 与 Context 见 [扩展框架](/supervisor/extensions)。
