# 子代理

子代理实现为 **子 Session**，不是另一套进程内 agent-host。

## 模型

| 字段                                | 含义                              |
| ----------------------------------- | --------------------------------- |
| `sessions.parent_id`                | 父子关系                          |
| `sessions.branch_type = "subagent"` | 由委派产生（旧值 `spawn` 会迁移） |
| `sessions.agent_id`                 | 实际执行的 Agent                  |
| 独立 `messages`                     | 子代理自己的消息树                |

父代理通过工具结果、事件与显式 resume 接收摘要，不共享完整上下文。

列表可见性由 `showInSessionList` 控制；`subagent` 通常不出现在主会话列表，可在父会话「聊天信息」中查看。详见 [会话管理](/supervisor/session)。

## 内置扩展

`src/extension/builtin/subagent/` 注册 `spawn_agent` 工具，典型参数：

- `subagent_type` / `agentId`：选择成员 Agent
- `prompt` / `instructions`：任务说明
- `run_in_background`：后台启动
- `finish_on_result`、`timeoutMs`、`maxResultChars`：前台等待与结果截断
- `systemPrompt`、`meta`：可选覆盖

成员关系持久化在 SQLite `members` 表，HTTP：

| Method | Path                     | 说明       |
| ------ | ------------------------ | ---------- |
| GET    | `/sessions/:id/members`  | 列出成员   |
| PUT    | `/sessions/:id/members`  | 更新成员   |
| GET    | `/sessions/:id/children` | 直接子会话 |
| GET    | `/sessions/:id/tree`     | 会话树     |

## 创建路径

- 工具：`spawn_agent`（扩展）
- 管理器：`SessionManager.spawn()`
- 其他子会话类型：`fork` / `clone` / `btw`（见会话文档）

## 相关

- [Shadow](/supervisor/shadow)
- [工作流](/supervisor/workflow)（Strict SDD 用子 Session 跑单阶段任务）
