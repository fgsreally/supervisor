# 工作流

Supervisor 用会话 meta 保存轻量工作流状态，扩展可在此之上实现阶段流水线。

## 核心状态

实现：`src/core/session-workflow.ts`。

```ts
meta.workflow = { stage: string; status: WorkflowStatus }
```

`status` 取值：

| Status                 | 含义           |
| ---------------------- | -------------- |
| `working`              | 阶段进行中     |
| `waiting_confirmation` | 等待用户确认   |
| `waiting_choice`       | 等待用户选择   |
| `completed`            | 阶段或流程完成 |

## HTTP API

| Method | Path                     | 说明              |
| ------ | ------------------------ | ----------------- |
| GET    | `/sessions/:id/workflow` | 读取              |
| PATCH  | `/sessions/:id/workflow` | 更新 stage/status |
| DELETE | `/sessions/:id/workflow` | 清除              |

Web UI 通过 `WorkflowStageTag` 展示当前 stage/status；完整工作流确认与选择面板尚未提供。

## Strict SDD 扩展

阶段名与推进逻辑不在核心硬编码。安装并绑定 `extensions/strict-sdd` 后，主 Session 可按阶段推进，例如：

`Brainstorm → Design → Spec → Mockup → Planning → Test/Vertical → Implement/Verify → Archive`

细节与产物目录见仓库内 `extensions/strict-sdd/README.md` 与 [仓库扩展](/supervisor/shipped-extensions)。

## 设计要点

- 子 Session 默认不启动工作流，避免递归阶段机。
- 详细执行记录可写在 Session 专属目录（如 `workflow/execution.json`），核心只保证 `meta.workflow` 可查询与 PATCH。
