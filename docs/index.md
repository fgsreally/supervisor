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
    details: SQLite 持久化的多会话管理、HTTP API、扩展框架、MCP 集成、上下文压缩
    link: /supervisor/overview
  - title: Web UI
    details: Vue 3 + Vite + Pinia 控制台，对话窗口、Agent/Provider 配置、资源管理
    link: /web-ui/overview
  - title: 扩展框架
    details: defineExtension DSL，加载本地或全局扩展，注入工具、命令、订阅事件
    link: /supervisor/extensions
  - title: MCP 集成
    details: 标准化接入外部 MCP 服务器，自动将 MCP 工具适配为 AgentTool
    link: /supervisor/mcp
---
