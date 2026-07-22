# CLI 命令

入口：`packages/supervisor/src/cli.ts`，构建产物 `packages/supervisor/dist/cli.mjs`，包 bin 名为 `pi-supervisor`。

```bash
pnpm run build
node packages/supervisor/dist/cli.mjs --help
# 或安装后
pi-supervisor --help
```

根目录 `pnpm run serve` 是常用 `serve` 参数的快捷方式。

## 启动 HTTP 服务器

```bash
node packages/supervisor/dist/cli.mjs serve --port 3030
# 常用快捷方式（playground + 本地 db）
pnpm run serve

# 仅监视重建 supervisor 包
pnpm run dev:supervisor
```

## Provider

```bash
node packages/supervisor/dist/cli.mjs providers add
node packages/supervisor/dist/cli.mjs providers list
node packages/supervisor/dist/cli.mjs providers set-key
node packages/supervisor/dist/cli.mjs providers remove
```

## Model

```bash
node packages/supervisor/dist/cli.mjs models list <provider-id>
node packages/supervisor/dist/cli.mjs models add
node packages/supervisor/dist/cli.mjs models remove
```

## Config

```bash
node packages/supervisor/dist/cli.mjs config
node packages/supervisor/dist/cli.mjs config show
node packages/supervisor/dist/cli.mjs config web-search [provider]
node packages/supervisor/dist/cli.mjs config web-fetch [provider]
node packages/supervisor/dist/cli.mjs config browser [headless|headed]
```

## Extension（全局 catalog + bind）

扩展安装到**全局 catalog**（一份代码、多 Agent 共用），再通过数据库绑定到具体 Agent。

```bash
# 从本地路径 / npm / git 安装到全局 catalog
node packages/supervisor/dist/cli.mjs extensions install ./extensions/strict-sdd
node packages/supervisor/dist/cli.mjs extensions install npm:<spec>
node packages/supervisor/dist/cli.mjs extensions install git:<url>

node packages/supervisor/dist/cli.mjs extensions list
node packages/supervisor/dist/cli.mjs extensions update <id>
node packages/supervisor/dist/cli.mjs extensions uninstall <id>

# 绑定 / 解绑到 Agent
node packages/supervisor/dist/cli.mjs extensions bind <agent-id> <id>
node packages/supervisor/dist/cli.mjs extensions unbind <agent-id> <id>
```

详情见 [扩展框架](/supervisor/extensions)。

## 通用选项

| 选项                | 说明                                    |
| ------------------- | --------------------------------------- |
| `-p, --port <port>` | HTTP 端口，默认 3030                    |
| `--db <path>`       | SQLite 路径，默认 `~/.pi/supervisor.db` |
| `--cwd <path>`      | 默认工作目录（`serve`）                 |
| `-h, --help`        | 帮助                                    |

## 说明

- 当前 CLI **未实现**单次 `print` 对话或 `rpc` 模式；日常使用走 `serve` + HTTP / Web UI。
- Session slash 命令通过 `GET/POST /sessions/:id/commands` 提供，Web UI Chat 已接入。
