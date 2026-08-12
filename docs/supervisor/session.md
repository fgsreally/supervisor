# Session 与派生 Session

Session 是运行和持久化单位：一条 `sessions` 记录、一棵消息树，以及运行时 harness。完整列与
meta 结构见[数据库结构](/supervisor/schema-reference)。

## 身份与运行配置

- `agent_id` 决定 Agent、模型和 tools preset；Session 不单独保存模型配置。
- `system_prompt` 保存本 Session 实际使用的完整 system 快照，不包含 skills 目录内容。
  扩展可在 `session.create` 时通过 `ctx.session.upsertSystemPromptBlock` /
  `appendSystemPrompt` 写入引导（如 project-services 的登记说明）；运行时服务状态提示仍不写入该列。
- 核心展示/状态使用列：`title`、`avatar`、`pinned`、`muted`、`unread`、`error_msg`、
  `stage`、`shadow_enabled` 等；不要重复写入 meta。
- 缺模型、等待审批等需要用户介入的情况使用 `status=blocked`，原因写 `error_msg`。

## 派生类型

有 `parent_id` 的 Session 是派生 Session；创建方式记录在 `spawn_type`。

| `spawn_type` | 创建方式                            | 上下文与消息                                                   |
| ------------ | ----------------------------------- | -------------------------------------------------------------- |
| `subagent`   | `spawn_agent` / `ctx.session.spawn` | 独立消息树与运行结果                                           |
| `btw`        | `POST /sessions/:id/btw`            | 动态读取父 Session 当前分支，自己的写入保持隔离；强制 readonly |
| `fork`       | 指定 entry 分叉                     | 创建时复制到分叉点的消息，并创建自己的 worktree                |
| `clone`      | 克隆                                | 创建时复制当前消息路径，并创建自己的 worktree                  |

根 Session 的 `parent_id` 与 `spawn_type` 均为 null。列表可见性由产品规则根据派生类型推导，
不存在 `show_in_session_list` 列。BTW 不再保存 `context_leaf_id`，因此读取的是父 Session 当前
路径，而不是创建时冻结的路径。

BTW 复用父 Session 的 Agent；如果父 Agent 是外部后端，会解析到可用的原生 Agent。BTW
只能使用原生 Agent，不依赖旧 members/tag 机制或单独的 packaged BTW Agent。

## 子 Agent 委派

主 Session 可委派 Agent 的白名单保存在 `sessions.meta.subagentIds`。HTTP 使用
`PUT /sessions/:id/subagents`，扩展使用 `ctx.agent.findByRole("spawned")` 解析。旧 `members`
表和 tag 查找已移除。

## 输入、错误与通知

- 排队输入写 `session_input_queue`；重启后恢复未投递项。
- LLM 失败会写 timeline `llm_error`，可由 `/retry` 重试；需要用户介入时状态为 `blocked`。
- 工具、Git complete 等非 LLM 错误通常通过工具结果或 UI 通知展示。
- `ctx.session.sendCustomMessage` 写仅供 timeline 展示的 custom message，不进入模型上下文。
- 消息已读状态在 `messages.meta.read`，Session 未读计数在 `sessions.unread` 列。

## Git worktree 与 Complete

Git 状态保存在 `sessions.meta.git = { worktreePath, branch, lastCommit, mergeError }`；存在
`worktreePath` 即启用 worktree。创建 worktree 时以当时 `project.cwd` checkout 的分支为基线。

Complete/Achieve 不缓存 merge 目标，而是始终合并到执行当下 `project.cwd` 的当前 checkout
分支。成功后清理 Session worktree；合并失败信息写 `meta.git.mergeError`。

## 删除语义

删除父 Session 时，依赖父上下文的 `subagent` 与 `btw` 递归删除；已经复制消息的 `fork` 与
`clone` 保留，外键将其 `parent_id` 置空。Session 关联的 messages、queued inputs 与 jobs
级联删除。

删除前扩展按 `session.before_delete` 停服务并移除 worktree。若 `git worktree remove`
因文件占用失败，`session-git-worktree` 会请华生阅读 AGENTS.md（本地开发服务启停）并重试，直到
目录可删。

## 主要接口

| 接口                          | 作用                             |
| ----------------------------- | -------------------------------- |
| `POST /sessions`              | 创建并启动根 Session             |
| `POST /sessions/:id/btw`      | 创建 BTW                         |
| `POST /sessions/:id/fork`     | 从 entry 分叉                    |
| `POST /sessions/:id/clone`    | 克隆                             |
| `GET /sessions/:id/children`  | 直接子 Session                   |
| `POST /sessions/:id/complete` | Complete/Achieve 并合并 worktree |
| `DELETE /sessions/:id`        | 按上述语义删除                   |

实现主要位于 `core/session-manager.ts`、`core/session-lifecycle.ts`、
`core/session-storage.ts` 与 `core/session-fields.ts`。
