# CLI 命令

`pi-supervisor` CLI 入口位于 `packages/supervisor/src/cli.ts`，编译产物 `dist/cli.mjs`。可用命令参考 `src/cli.ts:90-124` 的 `showHelp()` 输出。

::: tip
以下命令在 `pnpm run build` 后通过 `node packages/supervisor/dist/cli.mjs <command>` 调用，根目录 `pnpm run serve` 是 `serve --port 3030` 的快捷方式。
:::

## 启动 HTTP 服务器

```bash
node packages/supervisor/dist/cli.mjs serve --port 3030
# 或快捷方式
pnpm run serve

# 开发模式（tsdown --watch 重新构建）
pnpm --filter @earendil-works/pi-supervisor run dev
```

## Provider 管理

```bash
# 交互式添加 provider（选项包括 anthropic / openai / deepseek / openai-compatible 等）
node packages/supervisor/dist/cli.mjs providers add

# 列出
node packages/supervisor/dist/cli.mjs providers list

# 更新 API key
node packages/supervisor/dist/cli.mjs providers set-key

# 删除
node packages/supervisor/dist/cli.mjs providers remove
```

## Model 管理

```bash
# 列出某 provider 下的模型
node packages/supervisor/dist/cli.mjs models list <provider-id>

# 添加模型到指定 provider（交互式）
node packages/supervisor/dist/cli.mjs models add

# 删除模型（交互式）
node packages/supervisor/dist/cli.mjs models remove
```

## Extension 管理（per-agent）

扩展安装在 `~/.pi/supervisor/agents/{agentId}/extensions/`。

```bash
# 列出某 agent 的扩展
node packages/supervisor/dist/cli.mjs extensions list <agent-id>

# 复制扩展到 agent 目录
node packages/supervisor/dist/cli.mjs extensions install <agent-id> <path>

# 移除扩展
node packages/supervisor/dist/cli.mjs extensions remove <agent-id> <id>
```

## 通用选项

| 选项                 | 说明                                          |
| -------------------- | --------------------------------------------- |
| `-p, --port <port>`  | HTTP server 端口，默认 3030                   |
| `--db <path>`        | SQLite 数据库路径，默认 `~/.pi/supervisor.db` |
| `--<extension-flag>` | 扩展注册的 CLI flag（见扩展文档）             |
| `-h, --help`         | 显示帮助                                      |

::: warning 残留问题

- `print "<prompt>"` 单次对话命令、`rpc` 模式、`models set-default` 命令在原 SUPERVISOR.md / TUTORIAL.md 描述里出现过，但当前 `cli.ts` 没实现。如需这些命令需要补丁。
- `POST /sessions/:id/commands` 后端返回 501，扩展命令路由未挂钩。详见 [Supervisor 已知未实装功能](/supervisor/known-gaps)。
  :::
