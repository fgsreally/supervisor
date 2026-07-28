# Shadow

Shadow 是主 Session 每轮结束后的旁路分析。它不创建用户 Session，也不通过第二套 agent
系统运行；`runShadow` 使用华生内部 runner、`featureModels.assistant` 和终止型
`submit_result` 得到结构化结果。

## 行为

- 只处理启用了 `sessions.shadow_enabled` 的非内置根 Session。
- 使用当前轮消息与 Project/Session Shadow memory 生成建议、标题、提交信息或插入消息。
- 结构化输出写 `sessions.meta.shadow`，包括 `suggestedQuestions`、`message`、`status`、
  `memory`、`lastRunAt` 等。
- 必要消息通过 Session 输入队列投递；interrupt 输出使用更高输入优先级。
- 可建议标题、提交 checkpoint；失败只记录日志，不把普通 Session 变成 Shadow Session。
- UI 开关直接维护 `shadow_enabled` 列，不使用旧 `meta.shadowDisabled`。

实现位于 `extension/builtin/shadow/runner.ts`、`protocol.ts` 与 `memory.ts`。Shadow runner
虽然放在 builtin extension 目录下，但不是需要 bind 的 catalog 扩展。
