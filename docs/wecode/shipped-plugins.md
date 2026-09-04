# 仓库插件

仓库 `plugins/` 下提供可选插件包，需安装到全局 catalog 并 bind 到 Agent 后才会在会话中加载。

## 安装

```bash
pnpm run build
node packages/wecode/dist/cli.mjs plugins install ./plugins/strict-sdd
node packages/wecode/dist/cli.mjs plugins bind <agent-id> <plugin-id>
node packages/wecode/dist/cli.mjs plugins list
```

也可用 HTTP：`POST /plugins/install` 等，见 [HTTP API](/wecode/http-api)。

## strict-sdd

路径：`plugins/strict-sdd`

严格阶段式开发流水线（Brainstorm → … → Archive）。当前阶段写入 `sessions.stage`；
插件私有状态使用 namespaced Session meta，详细执行产物写入 Session 专属目录 `workflow/`。
说明见插件内 `README.md`，概念见 [工作流](/wecode/workflow)。

## hindsight

路径：`plugins/hindsight`

长期记忆插件。配置 `HINDSIGHT_API_URL` 走远程 API，否则可回退本地 JSONL。详见插件 `README.md`。

## native

路径：`plugins/native`

用 Rust/原生能力增强或覆盖部分工具路径。详见插件 `README.md`。

## 与内置插件的区别

| 类型     | 位置                                         | 启用方式                      |
| -------- | -------------------------------------------- | ----------------------------- |
| 内置     | `packages/wecode/src/plugin/builtin/` | 核心按绑定/会话需要激活       |
| 仓库插件 | `plugins/*`                               | `plugins install` + `bind` |

通用 DSL 与 Context 见 [插件框架](/wecode/plugins)。
