---
layout: home

hero:
  name: Pi Supervisor
  text: 多会话代理运行时 + Web UI
  tagline: SQLite-first 的 headless agent runtime，配套 Vue 3 控制台
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 架构总览
      link: /guide/architecture

features:
  - title: Supervisor
    details: 多会话管理、持久化 Job、HTTP API、扩展框架、MCP、滚动压缩
    link: /supervisor/overview
  - title: Web UI
    details: Vue 3 控制台：对话中断、Job、Slash、Agent/Provider/资源管理
    link: /web-ui/overview
  - title: 子代理与 Shadow
    details: spawn_agent + members；Shadow 旁路观察主会话
    link: /supervisor/subagents
  - title: 扩展与外部 Agent
    details: 全局 catalog + bind；Codex / Claude / ACP；仓库扩展 strict-sdd 等
    link: /supervisor/extensions
---
