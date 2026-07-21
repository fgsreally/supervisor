# supervisor-standalone

Standalone Supervisor：SQLite-first 多会话 Agent 运行时 + Vue 3 Web UI。

## Packages

- `packages/supervisor` — `pi-supervisor`（HTTP API、扩展、MCP、工具）
- `packages/supervisor-web-ui` — `pi-supervisor-ui`（Vue 3 + Vite）
- `extensions/*` — 可选仓库扩展（native / hindsight / strict-sdd）

## Prerequisites

- Node.js >= 20.6.0
- [pnpm](https://pnpm.io/)

## Install

```sh
pnpm install
```

## Common scripts

| Command                  | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `pnpm run build`         | 构建 supervisor 包（tsdown → `dist/`）           |
| `pnpm run serve`         | 启动 HTTP 服务（默认 :3030，playground cwd）     |
| `pnpm run dev`           | 启动 Web UI 开发服务器（Vite，:5173）            |
| `pnpm run dev:supervisor`| 构建并 watch / playground serve                  |
| `pnpm run lint`          | oxlint                                           |
| `pnpm run format`        | oxfmt                                            |
| `pnpm run check`         | lint + format check + 包级 check                 |
| `pnpm run test`          | 各包测试                                         |
| `pnpm run docs:dev`      | VitePress 文档开发服务器                         |
| `pnpm run docs:build`    | 构建文档到 `docs/.vitepress/dist`                |

工具链：oxlint / oxfmt / tsdown（supervisor）/ Vite（web-ui）。也可用与 pnpm 兼容的 [nub](https://github.com/nubjs/nub) 替代包管理命令。

## Documentation

完整文档在 [`docs/`](docs/)。本地预览：

```sh
pnpm docs:dev
```

常用入口：

- [快速开始](docs/guide/getting-started.md)
- [架构总览](docs/guide/architecture.md)
- [Supervisor 概览](docs/supervisor/overview.md)
- [HTTP API](docs/supervisor/http-api.md)
- [Web UI](docs/web-ui/overview.md)
- [已知缺口（后端）](docs/supervisor/known-gaps.md)
- [已知缺口（Web UI）](docs/web-ui/known-gaps.md)

开发者包内架构说明：[`packages/supervisor/SUPERVISOR.md`](packages/supervisor/SUPERVISOR.md)。

## Project layout

```
supervisor-standalone/
├── packages/
│   ├── supervisor/          (pi-supervisor)
│   └── supervisor-web-ui/   (pi-supervisor-ui)
├── extensions/              可选扩展包
├── docs/                    VitePress 文档
├── playground/              本地联调工作区
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Notes

- 上游依赖（`@earendil-works/pi-ai`、`pi-agent-core`、`pi-coding-agent` 等）从 npm 拉取。
- Web UI 以 `workspace:*` 依赖 `pi-supervisor`。
- supervisor 包用 tsdown 编译 `src/**/*.ts` → `dist/`；Web UI 保持 Vite + vue-tsc。
