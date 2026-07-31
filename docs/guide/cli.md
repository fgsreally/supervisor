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

根目录 `pnpm run serve` 是常用 `serve` 参数的快捷方式。

## 启动 HTTP 服务器

```bash
bun packages/supervisor/dist/cli.mjs serve --port 3030
# 常用快捷方式（playground + 本地 db）
pnpm run serve

# 构建后启动 playground Supervisor
pnpm run dev:supervisor

# 手机远程：构建 UI + Quick Tunnel + 终端二维码
pnpm run serve:tunnel
# 等价：
# pnpm run build:all
# bun packages/supervisor/dist/cli.mjs serve --tunnel --cwd playground
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

| 选项                | 说明                    |
| ------------------- | ----------------------- |
| `-p, --port <port>` | HTTP 端口，默认 3030    |
| `--cwd <path>`      | 默认工作目录（`serve`） |
| `-h, --help`        | 帮助                    |

数据库路径不通过 CLI 参数传入，按以下顺序读取：

1. 项目 `.supervisor/config.json` 的 `dbPath`
2. `~/.pi/supervisor/settings.json` 的 `dbPath`
3. 默认 `~/.pi/supervisor.db`

## 说明

- 当前 CLI **未实现**单次 `print` 对话或 `rpc` 模式；日常使用走 `serve` + HTTP / Web UI。
- Session slash 命令通过 `GET/POST /sessions/:id/commands` 提供，Web UI Chat 已接入。
