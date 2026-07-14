# Supervisor 使用指南

## 目录结构

- 全局资源：`~/.pi/supervisor/global/{skills,extensions,prompts}`
- Agent 目录：`~/.pi/supervisor/agents/{agentId}/`
- 数据库：`~/.pi/supervisor.db`

Agent 通过数据库 binding 使用全局资源，不在 Agent Home 中创建资源软链接。

## 扩展迁移（coding-agent -> supervisor）

1. 准备包含 `package.json` 和入口文件的扩展目录
2. Supervisor 扩展 API 见 `packages/supervisor/src/extension-system/`
3. 使用 `pi-supervisor extensions install <path>` 安装到全局 catalog
4. 使用 `pi-supervisor extensions bind <agent-id> <extension-id>` 绑定到 Agent

## Skill 安装

1. 将 skill 目录放入 `~/.pi/supervisor/global/skills/`
2. 在 UI 资源面板或 API `POST /agents/:id/resources` 绑定到 Agent
3. 输入框 `/` 可补全已关联的 skill 和 prompt

## 常用 API

- `POST /sessions/:id/prompt` - 发送消息
- `POST /sessions/:id/ask-answer` - 回答 ask 工具问题
- `GET /resources/global` - 列出全局资源

## Web UI 组件

见 `packages/supervisor-web-ui/README.md` 组件映射表。
