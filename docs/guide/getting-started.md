# 快速开始

本指南从零搭建可用的 Pi Supervisor 环境：安装依赖、构建后端、启动 HTTP API 与 Web UI，并完成一次对话。

## 前置要求

- Node.js >= 20.6.0
- [pnpm](https://pnpm.io/)（推荐）

## 1. 安装依赖

在仓库根目录：

```bash
pnpm install
```

## 2. 构建 Supervisor

```bash
pnpm run build
```

`tsdown` 会将 `packages/supervisor/src/` 编译到 `packages/supervisor/dist/`，产出 `cli.mjs` 等入口。

## 3. 启动 Supervisor HTTP API

```bash
pnpm run serve
```

默认监听 `http://localhost:3030`，工作目录为仓库内 `playground/`，数据库为 `playground/.supervisor/supervisor.db`。

也可用 CLI 显式指定：

```bash
node packages/supervisor/dist/cli.mjs serve --port 3030 --cwd playground --db playground/.supervisor/supervisor.db
```

健康检查：`GET http://localhost:3030/healthz` 应返回 `{ "ok": true }`。

## 4. 启动 Web UI

另开终端：

```bash
pnpm run dev
```

浏览器打开 `http://localhost:5173`。Vite 将 API 代理到 `http://localhost:3030`，无需配置 CORS。

::: tip
不要把 `VITE_API_BASE` 设成 `http://localhost:3030`，否则会触发跨域。留空即可走代理。
:::

## 5. 配置 Provider

通过 Web UI 的 Providers 页添加，或用 API：

```bash
curl -X POST http://localhost:3030/providers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "minimax",
    "name": "Minimax",
    "apiType": "openai-compatible",
    "baseUrl": "https://api.minimax.chat/v1",
    "apiKey": "sk-..."
  }'
```

也可使用交互式 CLI：

```bash
node packages/supervisor/dist/cli.mjs providers add
```

## 6. 配置 Agent

```bash
curl -X POST http://localhost:3030/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "default",
    "providerId": "minimax",
    "modelId": "MiniMax-M2.7",
    "toolsPreset": "coding"
  }'
```

`toolsPreset: "coding"` 会启用 read / bash / edit / write 以及 grep / find / ls 等探索工具。更多能力通过打包工具与扩展绑定启用，见 [打包工具](/supervisor/builtin-tools) 与 [扩展框架](/supervisor/extensions)。

## 7. 创建会话并发送消息

```bash
# 创建
curl -X POST http://localhost:3030/sessions \
  -H "Content-Type: application/json" \
  -d '{ "agentId": "<agent-id>", "cwd": "/path/to/workspace" }'

# 发送消息
curl -X POST http://localhost:3030/sessions/<session-id>/prompt \
  -H "Content-Type: application/json" \
  -d '{ "message": "Read TASK.md and suggest the first change." }'
```

或在 Web UI Chat 页创建会话并对话。运行时输入区仍可排队或立即干预；发送按钮会变成停止图标，用于中断当前 Turn。输入 `/` 可执行 slash 命令。

## 8. 可选：安装仓库扩展

仓库内提供 `extensions/native`、`extensions/hindsight`、`extensions/strict-sdd`。安装到全局 catalog 后绑定到 Agent：

```bash
node packages/supervisor/dist/cli.mjs extensions install ./extensions/strict-sdd
node packages/supervisor/dist/cli.mjs extensions bind <agent-id> <extension-id>
```

详见 [仓库扩展](/supervisor/shipped-extensions)。

## 故障排除

### 端口冲突

```bash
node packages/supervisor/dist/cli.mjs serve --port 3031 --cwd playground --db playground/.supervisor/supervisor.db
```

### Web UI 无法连接后端

1. 确认后端已启动（`http://localhost:3030/healthz` 可访问）。
2. 不要设置 `VITE_API_BASE`，或保持为空。
3. 检查 `packages/supervisor-web-ui` 的 Vite proxy 指向后端端口。

### 类型检查

```bash
pnpm --filter pi-supervisor-ui run check
```

仍存在的 UI 缺口见 [Web UI 已知缺口](/web-ui/known-gaps)。
