# Supervisor 使用指南

## 目录结构

- 全局资源：`~/.pi/supervisor/global/{skills,extensions,prompts}`
- Agent 目录：`~/.pi/supervisor/agents/{agentId}/`
- 数据库：`~/.pi/supervisor.db`

Agent 通过符号链接引用全局资源，而非复制文件。
## 扩展迁移（coding-agent -> supervisor）
1. 将扩展入口放到 `extensions/` 目录
2. Supervisor 扩展 API 见 `packages/supervisor/src/extension-system/`
3. 使用 `pi-supervisor extensions install <agent-id> <path>` 安装到指定 Agent

## Skill 安装

1. 将 skill 目录放入 `~/.pi/supervisor/global/skills/`
2. 在 UI 资源面板或 API `POST /agents/:id/resources/link` 关联到 Agent
3. 输入框 `/` 可补全已关联的 skill 和 prompt

## 常用 API

- `POST /sessions/:id/prompt` - 发送消息
- `POST /sessions/:id/ask-answer` - 回答 ask 工具问题
- `GET /resources/global` - 列出全局资源

## Web UI 组件

见 `packages/supervisor-web-ui/README.md` 组件映射表。
