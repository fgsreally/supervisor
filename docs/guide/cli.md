# CLI 命令

入口：`packages/supervisor/src/cli.ts`，构建产物 `packages/supervisor/dist/cli.mjs`，包 bin 名为 `pi-supervisor`。

运行时要求 Bun 1.2 或更高版本。包仍按标准 npm 包发布；用户先安装 Bun，再使用任意 npm 兼容包管理器全局安装即可：

```bash
npm install -g pi-supervisor
pi-supervisor --help
```

`pi-supervisor` 的 bin shebang 会直接调用 Bun，用户不需要用 Bun 安装这个 npm 包。

```bash
pnpm run build
bun packages/supervisor/dist/cli.mjs --help
# 或安装后
pi-supervisor --help
```

## 启动 HTTP 服务器

```bash
# 开发：一条命令起 API + Vite（无需先 build）
pnpm dev

# 仅后端 / 隧道（暂用 --cwd playground）
pnpm run serve
pnpm run serve:tunnel
```

`--tunnel` 会自动下载并启动 `cloudflared` Quick Tunnel；扫码后手输 PIN。详情见 [手机远程访问](/guide/mobile-remote-access)。

## Provider

```bash
bun packages/supervisor/dist/cli.mjs providers add
bun packages/supervisor/dist/cli.mjs providers list
bun packages/supervisor/dist/cli.mjs providers set-key
bun packages/supervisor/dist/cli.mjs providers remove
```

## Model

```bash
bun packages/supervisor/dist/cli.mjs models list <provider-id>
bun packages/supervisor/dist/cli.mjs models add
bun packages/supervisor/dist/cli.mjs models remove
```

## Config

```bash
bun packages/supervisor/dist/cli.mjs config
bun packages/supervisor/dist/cli.mjs config show
bun packages/supervisor/dist/cli.mjs config web-search [provider]
bun packages/supervisor/dist/cli.mjs config web-fetch [provider]
bun packages/supervisor/dist/cli.mjs config browser [headless|headed]
```

## Extension（全局 catalog + bind）

扩展安装到**全局 catalog**（一份代码、多 Agent 共用），再通过数据库绑定到具体 Agent。

```bash
# 从本地路径 / npm / git 安装到全局 catalog
bun packages/supervisor/dist/cli.mjs extensions install ./extensions/strict-sdd
bun packages/supervisor/dist/cli.mjs extensions install npm:<spec>
bun packages/supervisor/dist/cli.mjs extensions install git:<url>

bun packages/supervisor/dist/cli.mjs extensions list
bun packages/supervisor/dist/cli.mjs extensions update <id>
bun packages/supervisor/dist/cli.mjs extensions uninstall <id>

# 绑定 / 解绑到 Agent
bun packages/supervisor/dist/cli.mjs extensions bind <agent-id> <id>
bun packages/supervisor/dist/cli.mjs extensions unbind <agent-id> <id>
```

详情见 [扩展框架](/supervisor/extensions)。

## 通用选项

| 选项                | 说明                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| `-p, --port <port>` | HTTP 端口，默认 3030                                                        |
| `--cwd <path>`      | Supervisor 全局根（db/public/global/agents/projects；默认 `~/.supervisor`） |
| `-h, --help`        | 帮助                                                                        |

`--cwd` 决定全局根。数据库默认在 `<cwd>/supervisor.db`（或 `~/.supervisor/supervisor.db`）。也可用 `<home>/settings.json` 的 `dbPath` 覆盖。

开发时：`pnpm dev` 暂用 `--cwd playground`。

## 说明

- 当前 CLI **未实现**单次 `print` 对话或 `rpc` 模式；日常使用走 `serve` + HTTP / Web UI。
- Session slash 命令通过 `GET/POST /sessions/:id/commands` 提供，Web UI Chat 已接入。
