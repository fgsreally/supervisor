# Supervisor 概览

`@earendil-works/pi-supervisor` 是 SQLite-first、headless 的多会话 agent 运行时。

## 核心边界

- 会话由 `SessionManager` 管理，每个会话对应一个 `AgentHarness`。
- 默认 agent 工具只保留 pi 原生 `read`、`bash`、`edit`、`write`。
- 其他 agent 工具必须通过扩展注册或覆盖。
- 扩展由 `src/extensions/loader.ts` 从 agent/project 目录或显式路径加载，不强制加载工具扩展。
- 会话生命周期逻辑在 `src/core/session-lifecycle.ts`，例如 git worktree、自动命名和结束时 git 合并；这些不是 agent tool。

## 主要目录

```text
src/
  agent/              agent 资源、skills、prompt templates
  config/             内置 provider 等后端配置
  core/               session-manager、session-runtime、storage、checkpoint、turn file tracker
  db/                 SQLite schema、迁移、FTS
  extension/          扩展框架及内置扩展
  http/               Hono HTTP API
  resources/          通用资源 Handler、catalog 与 Agent 绑定框架
  tools/              LSP、AST、read/edit/ask 等打包工具
  utils/              git、default-tools、exec、settings、utility-llm 等
```

## 进一步阅读

- [会话管理](/supervisor/session)
- [HTTP API](/supervisor/http-api)
- [扩展框架](/supervisor/extensions)
- [Agent 工具](/supervisor/builtin-tools)
- [MCP 集成](/supervisor/mcp)
- [上下文压缩](/supervisor/compaction)
- [已知未实装功能](/supervisor/known-gaps)
