# Supervisor 概览

`pi-supervisor` 是 SQLite-first、headless 的多会话 Agent 运行时。

## 核心边界

- 会话由 `SessionManager` 管理，每个会话对应一个 harness（内置或外部 Agent）。
- 默认工具由 `toolsPreset` 决定：`coding` 含 pi 原生 read / bash / edit / write，以及 grep / find / ls；`readonly` 为只读探索集。
- 额外能力通过 **打包工具**（`src/tools/`）与 **扩展**（全局 catalog + Agent bind）启用。
- 扩展由 `src/extension/` 加载；会话只加载数据库中已绑定的扩展。
- 生命周期逻辑（worktree、自动命名、结束合并等）在 `src/core/session-lifecycle.ts`，不是 agent tool。

## 主要目录

```text
src/
  agent/              agent 资源、skills、builtin agents
  config/             内置 provider 等配置
  core/               session-manager、runtime、workflow、compaction、external
  db/                 SQLite schema、迁移、members、FTS
  extension/          扩展框架及内置扩展（mcp / subagent / shadow / …）
  http/               Hono HTTP API
  resources/          资源 Handler、catalog 与 Agent 绑定
  tools/              打包工具（ask / edit / lsp / web / browser / …）
  testing/            AI 效果测试公共 API
  utils/              default-tools、settings、git 等
  cli.ts              CLI 入口
  index.ts            库入口
```

## 能力索引

| 主题          | 文档                                       |
| ------------- | ------------------------------------------ |
| 会话 / 子会话 | [会话管理](/supervisor/session)            |
| HTTP 路由     | [HTTP API](/supervisor/http-api)           |
| 扩展 DSL      | [扩展框架](/supervisor/extensions)         |
| 打包工具      | [打包工具](/supervisor/builtin-tools)      |
| MCP           | [MCP 集成](/supervisor/mcp)                |
| 压缩          | [上下文压缩](/supervisor/compaction)       |
| 工作流        | [工作流](/supervisor/workflow)             |
| 子代理        | [子代理](/supervisor/subagents)            |
| Shadow        | [Shadow](/supervisor/shadow)               |
| 外部 Agent    | [外部 Agent](/supervisor/external-agents)  |
| 仓库扩展      | [仓库扩展](/supervisor/shipped-extensions) |
| AI 测试       | [AI 效果测试](/supervisor/ai-testing)      |
| 真实缺口      | [已知缺口](/supervisor/known-gaps)         |
