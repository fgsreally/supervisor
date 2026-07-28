# 工作流阶段

Supervisor 核心只保存一个轻量阶段标签：`sessions.stage`。实现位于
`src/core/session-workflow.ts`，扩展可在其上实现自己的阶段机。

## 核心 API

| Method | Path                     | 说明                                           |
| ------ | ------------------------ | ---------------------------------------------- |
| GET    | `/sessions/:id/workflow` | 返回 `{ workflow: { stage, status: "working" } | null }` |
| PATCH  | `/sessions/:id/workflow` | 设置 `stage`                                   |
| DELETE | `/sessions/:id/workflow` | 清除 `stage`                                   |

`workflow` 是兼容命名，`status` 恒为 `working`，不会持久化。扩展若需要
`waiting_confirmation`、`waiting_choice`、`completed` 等状态，必须写自己的 namespaced
`sessions.meta`，不能再写旧的 `meta.workflow`。

扩展 API 对应 `ctx.session.workflow.get/set/clear`，阶段变化触发
`workflow.stage_changed`。`workflow.status_changed` 只保留在兼容类型中，新扩展不应依赖它。

## Strict SDD

`extensions/strict-sdd` 为主 Session 提供阶段式流程：

`Brainstorm → Design → Spec → Mockup → Planning → Test/Vertical → Implement/Verify → Archive`

当前阶段使用 `sessions.stage`；扩展状态使用 `sessions.meta.strictSdd.status`；change、循环和
子 Session 进度写入 Session 专属目录的 `workflow/execution.json`。子 Session 不会递归启动流程。
