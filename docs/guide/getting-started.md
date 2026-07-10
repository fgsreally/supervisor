# 快速开始

本指南从零开始搭建一个可用的 Pi Supervisor 运行环境：构建后端、启动 HTTP API、配置 Provider 与 Agent、启动 Web UI。

## 前置要求

- Node.js >= 20.6.0
- pnpm（或兼容的 nub）

## 1. 安装依赖

在仓库根目录：

```bash
pnpm install
```

## 2. 构建 Supervisor

```bash
pnpm run build
```

构建脚本会调用 `tsdown`，将 `packages/supervisor/src/` 下的 TypeScript 编译到 `packages/supervisor/dist/`。

::: warning
当前 `packages/supervisor/src/` 下没有 `cli.ts` 或 `index.ts` 入口文件，所以 `dist/cli.js` 不会生成。这意味着 `pnpm run serve` 暂时无法直接运行。这是上游 pi 仓库遗留的状态，详见 [Supervisor 已知未实装功能](/supervisor/known-gaps)。

要跑起来，需要自行补一个 `src/cli.ts` 入口（解析 argv、调用 `http-server.ts` 的 `startHttpServer`）和 `src/index.ts`（重新导出公共 API）。本文档不实现该入口，只做说明。
:::

## 3. 启动 Supervisor HTTP API

补完 CLI 入口后：

```bash
pnpm run serve
# 等价于 node packages/supervisor/dist/cli.js serve --port 3030
```

默认监听 `http://localhost:3030`。

## 4. 启动 Web UI

Web UI 通过 Vite 代理转发 API 请求到 `http://localhost:3030`，无需配置 CORS：

```bash
pnpm run dev
```

打开浏览器访问 `http://localhost:5173`。

::: tip
如果 `VITE_API_BASE` 写成了 `http://localhost:3030`，会触发跨域错误。让它留空，使用 Vite 代理。
:::

## 5. 配置 Provider

通过 API 添加 Provider（以 OpenAI 兼容的 minimax 为例）：

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

或通过 Web UI 的 Providers 标签页添加。

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

或通过 Web UI 创建会话并在 Chat 面板对话。

## 8. 编写自定义 Skill

在工作目录创建 `SKILL.md`：

```bash
mkdir -p ~/pi-workspace/skills/my-skill
cat > ~/pi-workspace/skills/my-skill/SKILL.md << 'EOF'
# My Skill

这是一个示例 skill。

## 功能

- 功能 1
- 功能 2
EOF
```

Supervisor 启动时会扫描 agent 工作目录下的 `skills/*/SKILL.md`，把 skill 列表注入到对话上下文。

## 故障排除

### 端口冲突

```bash
pnpm run serve -- --port 3031    # 切换端口
```

### Web UI 无法连接后端

检查：

1. Supervisor 后端已启动（`http://localhost:3030` 可访问）。
2. `packages/supervisor-web-ui/.env` 不存在或 `VITE_API_BASE` 留空。
3. `vite.config.ts` 的 proxy 配置正确指向后端端口。

### 类型错误

```bash
pnpm --filter @earendil-works/pi-supervisor-ui run check
```

类型检查会暴露源码中已知的问题，详见 [Web UI 已知未实装功能](/web-ui/known-gaps)。
