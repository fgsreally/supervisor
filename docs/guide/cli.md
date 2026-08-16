# CLI 命令

入口：`packages/supervisor/src/cli.ts`，构建产物 `packages/supervisor/dist/cli.mjs`，包 bin 名为 `pi-supervisor`。

运行时要求 Node.js 20.6 或更高版本。包按标准 npm 包发布：

```bash
npm install -g pi-supervisor
pi-supervisor --help
```

```bash
pnpm run build
node packages/supervisor/dist/cli.mjs --help
# 或安装后
pi-supervisor --help
```

## 启动 HTTP 服务器

```bash
# 开发：两个终端分别起 API 与 Vite（无需先 build）
pnpm run dev:server
pnpm run dev:web

# 仅后端 / 隧道（暂用 --cwd playground）
pnpm run serve
pnpm run serve:tunnel
```

`--tunnel` 会自动下载并启动 `cloudflared` Quick Tunnel；扫码后手输 PIN。详情见 [手机远程访问](/guide/mobile-remote-access)。

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

| 选项                | 说明                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| `-p, --port <port>` | HTTP 端口，默认 3030                                                        |
| `--cwd <path>`      | Supervisor 全局根（db/public/global/agents/projects；默认 `~/.supervisor`） |
| `-h, --help`        | 帮助                                                                        |

`--cwd` 决定全局根。数据库默认在 `<cwd>/supervisor.db`（或 `~/.supervisor/supervisor.db`）。也可用 `<home>/settings.json` 的 `dbPath` 覆盖。

开发时：`pnpm run dev:server` 暂用 `--cwd playground`。

## 说明

- 当前 CLI **未实现**单次 `print` 对话或 `rpc` 模式；日常使用走 `serve` + HTTP / Web UI。
- Session slash 命令通过 `GET/POST /sessions/:id/commands` 提供，Web UI Chat 已接入。
