# Pi 管理助手

内置 Pi 助手是 Supervisor 唯一的自然语言管理入口。用户描述目标即可，助手负责查询对象、选择
HTTP/CLI/数据库入口、执行并验证，不要求用户学习内部 ID、扩展安装命令或表结构。旧 Intro 的
会话与资源绑定会迁移到 Pi 助手，随后删除重复的 Intro Agent。

## 管理工具

内置 `supervisor-admin` 扩展只绑定到 `Pi 助手`：

| 工具                            | 用途                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| `supervisor_runtime_info`       | 查询当前进程实际 HTTP、数据库、配置来源、cwd、启动参数与安全环境 |
| `supervisor_capabilities`       | 从 Elysia OpenAPI 或 CAC 注册表按模块查询当前 HTTP/CLI 能力      |
| `supervisor_http`               | 调用本机 Supervisor HTTP API；支持 GET/POST/PUT/PATCH/DELETE     |
| `supervisor_db_query`           | 执行单条只读 SELECT 或 schema PRAGMA，核对未暴露的数据事实       |
| `supervisor_db_write`           | HTTP/CLI 无入口时执行单条 INSERT/UPDATE/DELETE；始终请求用户确认 |
| `supervisor_scaffold_extension` | 在明确的 Project 目录中生成当前扩展 API 脚手架，不覆盖已有目录   |

助手不得把默认 HTTP 地址或默认数据库路径当作当前事实；操作前通过 `supervisor_runtime_info` 查询。
DELETE、卸载、kill、complete 等操作会额外请求确认。

## 决策与安全边界

助手按 HTTP > CLI > 直接数据库的顺序选择入口。直接数据库工具禁止多语句和 schema 修改；
写入会显示原因与 SQL，并由 UI 审批。所有写操作完成后应重新 GET 或查询数据库验证结果。

脚手架只创建 `package.json`、`index.ts` 和 `README.md`，使用当前 `defineExtension` 与
`ctx.agent.registerTool`。助手随后负责调用扩展安装和 Agent 绑定 API，并检查加载结果。

Pi 助手的内置 system prompt 在启动时同步为当前管理规范。内置 `supervisor-guide` skill 只替换
旧的出厂版本；旧 Intro 的会话与资源绑定会先转移给 Pi 助手，避免迁移时丢失关联。
