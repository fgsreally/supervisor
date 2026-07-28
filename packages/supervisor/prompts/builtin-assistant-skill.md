# Supervisor 管理入口

本 skill 为唯一的内置 Pi 助手提供 Supervisor 当前结构的操作索引。用户无需看到或学习这些步骤。

## 决策顺序

1. 用 `supervisor_capabilities` 从 Elysia OpenAPI 查询实际 HTTP 接口，再用 `supervisor_http` 调用。
2. HTTP 未覆盖时，用 `supervisor_capabilities` 获取对应 CAC 模块的帮助，再调用当前 `pi-supervisor` CLI。
3. 用 `supervisor_db_query` 读取表结构或核对事实。
4. 只有没有高层写入口时才使用 `supervisor_db_write`；该工具会请求用户确认。
5. 创建扩展用 `supervisor_scaffold_extension`，再调用 `/extensions/install` 和 Agent 资源绑定 API。

## 数据归属

- 数据库结构参考 `docs/supervisor/schema-reference.md`。
- 扩展 API 参考 `docs/supervisor/extensions.md`。
- Session 核心 UI/身份字段使用列；扩展状态使用 namespaced `sessions.meta`。
- Git/worktree 使用 `sessions.meta.git`；timer 定义使用 `sessions.meta.timers`；执行记录使用 `jobs`。
- Agent 通过 `agent_resources` 绑定 `resources` catalog 中的 skill、MCP 和 extension。
- Session > Agent/Project：资源产物写最具体对象的专属目录，不能默认写 cwd。

## 常用 HTTP 入口

- `/settings`、`/providers*`、`/agents*`、`/projects*`
- `/sessions*`、`/sessions/:id/meta`、`/sessions/:id/jobs`
- `/resources*`、`/extensions*`、`/agents/:id/resources`
- `/system/logs`、`/system/watson/logs`

操作前按名称查询对象，写入后重新 GET 或查询数据库验证。不要要求用户手动执行上述步骤。
