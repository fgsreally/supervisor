# Strict SDD Supervisor Extension

非内置的严格阶段式开发扩展。把本扩展安装并绑定到一个用于主 Session 的 Agent 后，Session 会自动开始：

`Brainstorm → Design → Spec → Mockup → Planning → Test/Vertical → Implement/Verify → Archive`

状态只持久化为 `session.meta.workflow = { stage, status }`。详细 change、循环和子 Session 进度写入该 Session 专属目录的 `workflow/execution.json`。

子 Session 永远不会启动本工作流，也不能递归创建工作流子 Agent。Test、Implement、Verify、Archive 都使用独立的单用途子 Session。

Planning 阶段的 `plan.json` 决定 change 和结构化测试命令。用户可以在 Planning 后选择：

- `test`：先为所有 change 编写测试，再逐个实现、验证和归档。
- `vertical`：每个 change 依次完成测试、实现、验证和归档。

前端工作流面板尚未实现。当前可以通过 `/sessions/:id/workflow` API 查看和推进 `waiting_confirmation` / `waiting_choice` 状态。
