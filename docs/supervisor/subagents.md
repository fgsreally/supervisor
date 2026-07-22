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

列表可见性由 `showInSessionList` 控制；活动中的 `subagent` 可以在会话列表和父会话「聊天信息」中查看，完成后隐藏，重新继续时再次显示。详见 [会话管理](/supervisor/session)。

## 内置扩展

`src/extension/builtin/subagent/` 注册 `spawn_agent` 工具，典型参数：

- `agentName`：创建时选择成员 Agent
- `sessionId`：继续已有的直属子 Session，不创建新 Session
- `urgency`：继续时使用；`normal` 排队，`urgent` 中断子 Session 当前 turn 后立即执行
- `prompt` / `instructions`：任务说明
- `run_in_background`：后台启动
- `finish_on_result`、`timeoutMs`、`maxResultChars`：前台等待与结果截断
- `systemPrompt`、`meta`：可选覆盖

`spawn_agent` 不传 `sessionId` 时创建子 Session；传入时复用该 Session 的消息历史。若子 Session 已经是 `finish` / `finished`，Supervisor 会先将其恢复为 `idle` 并重新显示，再提交输入；若它仍在运行，输入进入与主 Session 相同的队列。

`get_subagent_status` 接收 `sessionId`，返回当前状态、队列中的输入数量、最近活跃时间以及最新一条 assistant 输出。父代理可先检查执行情况，再决定是否通过 `spawn_agent` 发送普通或紧急消息。

Supervisor 启动时会把遗留的 `starting`、`running`、`waiting_user` 状态归一为 `idle`，并恢复 SQLite 中尚未投递的输入队列。`finish`、`finished` 和 `error` 保持不变。

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
