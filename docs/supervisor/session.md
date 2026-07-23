# Session 与子 Session

Session 是 supervisor 的核心运行单元，对应一个 agent harness、一棵消息树和一条 SQLite `sessions` 记录。

## 子 Session 的严格定义

只要一个 Session 来源于另一个 Session，它就是后者的子 Session，并必须设置 `parentId`。`branchType` 记录创建方式：

| `branchType` | 创建方式                   | 是否出现在主会话列表   | 消息与上下文                             |
| ------------ | -------------------------- | ---------------------- | ---------------------------------------- |
| `subagent`   | `spawn_agent` 等子代理调用 | 活动时显示，完成后隐藏 | 独立消息树                               |
| `fork`       | 从指定消息处分叉           | 是                     | 创建时复制指定路径                       |
| `clone`      | 克隆会话                   | 是                     | 创建时复制完整当前路径                   |
| `btw`        | “顺便问一下”               | 否                     | 不复制消息，读取父会话创建时的上下文快照 |

根 Session 的 `parentId` 和 `branchType` 都是 `null`。

`showInSessionList` 是列表可见性的唯一依据。它与 `parentId` 分开，是因为 `fork` 和 `clone` 虽然是子 Session，却需要出现在 Web UI 主会话列表中。所有直接子 Session 都可在父会话的“聊天信息”面板查看。

等待中的 Session 输入持久化在 SQLite。Supervisor 重启时会把中断的运行状态归一为 `idle`，然后继续处理尚未投递的队列输入。

旧数据库中的 `branchType = "spawn"` 会在迁移时转换成 `"subagent"`。

## BTW 上下文快照

创建 BTW 时，后端把父会话当前的 `leafId` 保存为子会话的 `contextLeafId`，但不会向 BTW 的 `messages` 记录复制任何父消息。

运行 BTW 时，存储层向 agent 组合两部分内容：

1. 父会话从根到 `contextLeafId` 的只读路径；
2. BTW 自己写入的消息。

因此，父会话在 BTW 创建后新增的消息不会进入该 BTW；BTW 的新消息也只存在于自己的 `messages` 记录中。BTW 可以继续创建 BTW，读取层会递归组合每一层被冻结的上下文。

BTW 使用 packaged `btw` agent 的 `SYSTEM.md`（由 `agents/btw/prompt.md` 种子写入），经 `POST /sessions/:id/btw` / `SessionManager.createBtw` 创建，不经 members `tag=btw`。

## 错误与通知

- **LLM 失败**：`status=error`，timeline 写入 `customType: llm_error`（不进模型上下文），前端错误卡可 `POST /sessions/:id/retry`。
- **非 LLM 错误**（工具失败、complete/git 等）：工具结果回给模型或 SSE `ui_notify` toast；**不会**把 session 标为 `error`。

## 未读

- 消息条目可带 `meta.read`；会话 `meta.unread` 为未读计数。
- 无人观看时写入的 assistant 消息会累加未读；打开会话时 `POST /sessions/:id/read` 清零。

## 时间线通知

- `SessionManager.sendCustomMessage` / `ctx.session.sendCustomMessage` 写入 `custom_message`，仅 UI 展示，不进模型上下文。

## Worktree

- 根会话可在 git 仓库创建独立 worktree（见 `session-lifecycle`）；无内置 preview 反代产品。

## 删除语义

删除父 Session 时：

- 依赖父上下文或父任务的 `subagent`、`btw` 随父 Session 删除；
- 已复制出独立消息的 `fork`、`clone` 保留，数据库外键会将其 `parentId` 置空。

## 主要接口

| 方法或接口                   | 说明                                  |
| ---------------------------- | ------------------------------------- |
| `SessionManager.create()`    | 只创建 Session 记录                   |
| `SessionManager.spawn()`     | 创建并启动根 Session 或子代理 Session |
| `POST /sessions/:id/btw`     | 创建 BTW 子 Session                   |
| `POST /sessions/:id/fork`    | 从指定消息分叉                        |
| `POST /sessions/:id/clone`   | 克隆当前会话                          |
| `GET /sessions/:id/children` | 获取所有直接子 Session                |
| `DELETE /sessions/:id`       | 按上述删除语义删除 Session            |

持久化字段定义位于 `packages/supervisor/src/types.ts`，创建和生命周期编排位于 `packages/supervisor/src/core/session-manager.ts`，BTW 上下文叠加位于 `packages/supervisor/src/core/session-storage.ts`。

相关：[子代理](/supervisor/subagents)、[工作流](/supervisor/workflow)。
