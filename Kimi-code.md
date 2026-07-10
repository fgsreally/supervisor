# Kimi-code 借鉴记录

本文件记录从相邻 `../kimi-code` 观察到、对 supervisor 有价值但当前暂不优先实现的能力。已决定近期推进的能力不放在这里，避免 backlog 混杂。

## 暂不优先：生命周期 hooks

Kimi-code 的 hooks 覆盖会话、工具、权限、压缩、子代理、通知等生命周期节点。参考实现：

- `../kimi-code/packages/agent-core/src/session/hooks/types.ts`
- `../kimi-code/packages/agent-core/src/session/hooks/engine.ts`
- `../kimi-code/packages/agent-core/src/session/hooks/runner.ts`

值得关注的 hook 类型：

- `PreToolUse` / `PostToolUse` / `PostToolUseFailure`：工具调用前后审计、阻断危险操作、失败后自动收集诊断。
- `PermissionRequest` / `PermissionResult`：把权限决策做成可记录、可扩展的流程。
- `UserPromptSubmit`：用户输入进入模型前做规范化、审计或注入额外上下文。
- `Stop` / `StopFailure` / `Interrupt`：会话结束、失败、中断后的清理和通知。
- `SessionStart` / `SessionEnd`：会话启动和关闭时执行本地自动化。
- `PreCompact` / `PostCompact`：上下文压缩前后保留审计、快照或指标。
- `Notification`：向桌面、外部系统或 UI 发送事件。

对 supervisor 的潜在价值：

- 在工具调用层补齐统一 guardrail，而不是只在单个 edit/ask 工具里做局部审批。
- 把本地自动化接到 agent 生命周期，例如编辑后自动检查、失败后自动诊断、压缩前保存上下文。
- 让扩展系统获得更明确的阻断语义：hook 可以返回 allow/block，并带 reason/message。

当前暂不处理原因：

- supervisor 已有 extension runtime 和部分事件转发，应该先厘清现有事件模型再决定是否引入独立 hook engine。
- hooks 涉及工具执行链路、权限模型、UI 呈现和测试边界，改动面较大。

## 后续评估：skill registry

Kimi-code 的 skill registry 思路不是简单把所有 skill 内容塞进 system prompt，而是让模型通过一个显式工具/注册表发现、选择和加载 skill。它更像“可查询的能力索引”，而不是 supervisor 当前偏静态的 prompt 资源列表。

参考方向：

- skill 元数据集中注册：名称、描述、适用场景、入口文件、可能的参数或触发条件。
- 模型先查询 registry，再决定是否加载具体 skill 内容。
- skill 内容可以按需展开，减少 system prompt 常驻上下文。

对 supervisor 的潜在价值：

- 当 skill 数量变多时，避免 system prompt 过长。
- 让模型先检索“有什么能力”，再按需读取具体说明。
- 未来可以和项目级 hindsight、项目类型识别结合，自动推荐相关 skill。

需要进一步厘清的问题：

- supervisor 现有 skill 是核心代码管理的 prompt 资源，还是应该逐步迁移成工具式 registry。
- `registerTool` 注册的是可执行工具，skill registry 注册的是“能力说明/工作流说明”，两者语义不同，不能简单合并。
- 如果 registry 本身做成工具，如何避免模型频繁查询造成额外 token 和 latency。

## 后续评估：资源感知并发调度

Kimi-code 的 tool scheduler 会根据工具声明的资源访问范围决定是否并发执行。参考实现：

- `../kimi-code/packages/agent-core/src/loop/tool-call.ts`
- `../kimi-code/packages/agent-core/src/loop/tool-scheduler.ts`
- `../kimi-code/packages/agent-core/src/loop/tool-access.ts`

核心概念是每个工具声明 `accesses`：

- `none()`：不占用本地项目资源，可自由并发。
- `readFile(path)` / `readTree(path)`：只读文件或目录。
- `searchTree(path)`：搜索目录，语义上也是只读。
- `writeFile(path)` / `writeTree(path)`：写文件或目录。
- `readWriteFile(path)` / `readWriteTree(path)`：读写文件或目录。
- `all()`：未知或全局副作用，和所有工具互斥。

调度规则由代码执行，不由 LLM 决定。LLM 输出一批 tool calls 后，调度器按原始顺序检查资源冲突：不冲突的立即并发，冲突的排队等待，最终结果仍按 provider 原始 tool call 顺序回填。

对 supervisor 的潜在价值：

- 让 agent 更敢一次性并发探索多个无冲突任务，例如搜索、读取、远端查询。
- 避免两个写工具同时修改同一路径。
- 自定义工具可以通过声明 `accesses` 获得更安全的并发能力。

当前暂不处理原因：

- pi-agent-core 当前只有 `parallel` / `sequential` 两档执行模式，缺少 Kimi 这种 batch-level scheduler。
- supervisor 扩展层可以强行做资源锁 wrapper，但只能约束工具进入 `execute()` 后的执行，无法真正接管整批 tool call 的调度。
- 若要覆盖内置工具和扩展工具，较合理的位置仍在 pi-agent-core 的 tool call 执行循环附近。

## 后续评估：plan mode

Kimi-code 的 plan mode 是一个受限规划状态，不只是让模型“先写计划”。参考实现：

- `../kimi-code/packages/agent-core/src/agent/plan/index.ts`
- `../kimi-code/packages/agent-core/src/tools/builtin/planning/enter-plan-mode.ts`
- `../kimi-code/packages/agent-core/src/tools/builtin/planning/exit-plan-mode.ts`
- `../kimi-code/packages/agent-core/src/agent/injection/plan-mode.ts`
- `../kimi-code/packages/agent-core/src/agent/permission/policies/plan-mode-guard-deny.ts`

核心机制：

- 进入 plan mode 后创建一个 plan id，并准备专属 plan markdown 文件路径。
- plan mode 激活期间，模型被动态提醒只能探索、设计、写 plan 文件，不能直接修改项目文件。
- `ExitPlanMode` 会读取 plan 文件，把计划作为审批内容展示给用户。
- plan 可以携带 2-3 个可选方案，让用户在审批时选择具体执行路径。
- 离开 plan mode 后再恢复普通工具和权限规则。

对 supervisor 的潜在价值：

- 把“大改动前先想清楚”变成运行时状态，而不是只靠提示词约束。
- 给 Web UI 一个明确的 plan review 面板，而不是让用户在聊天正文里找计划。
- 可与项目工作目录结合，把 plan 文件存在 session 或 project 工作目录中。

实现注意：

- 需要工具权限/guardrail 配合，否则模型仍可能在 plan mode 中调用写工具修改真实项目。
- 需要 UI 支持审批、修订、拒绝、选择方案。
- 最小版本可以先实现状态、plan 文件、Enter/Exit 两个工具，暂不做复杂权限菜单。

supervisor 落地建议：

- 按“核心支持的内置扩展”实现，而不是嵌进 pi-coding-agent。
- 扩展负责 `EnterPlanMode` / `ExitPlanMode`、plan 文件、状态存储、动态提醒和 UI 事件。
- 核心扩展 API 需要提供工具拦截能力，例如 `ctx.tools.beforeUse()`，用于阻止非 plan 文件写入。
- plan 文件建议放在 session 工作目录，后续也可以支持 project 级计划。

## 后续评估：goal mode

Kimi-code 的 goal mode 是持久目标驱动，不等于 TodoList，也不等于 plan。参考实现：

- `../kimi-code/packages/agent-core/src/agent/goal/index.ts`
- `../kimi-code/packages/agent-core/src/tools/builtin/goal/create-goal.ts`
- `../kimi-code/packages/agent-core/src/tools/builtin/goal/get-goal.ts`
- `../kimi-code/packages/agent-core/src/tools/builtin/goal/update-goal.ts`
- `../kimi-code/packages/agent-core/src/tools/builtin/goal/set-goal-budget.ts`
- `../kimi-code/packages/agent-core/src/agent/injection/goal.ts`

核心机制：

- 一个 agent 有一个当前 goal，状态包括 `active`、`paused`、`blocked`、`complete`。
- goal 有 objective、completionCriterion、turn/token/time budget、已用 turn/token/time。
- 模型通过 `CreateGoal` 创建目标，通过 `GetGoal` 读取状态，通过 `UpdateGoal` 标记 active/paused/blocked/complete。
- `complete` 是瞬时状态：完成后记录并清除当前 goal。
- `paused` 和 `blocked` 都可恢复，但含义不同：paused 是暂停，blocked 是系统/模型认为无法继续。
- active goal 会通过动态注入持续提醒模型目标、预算和完成/阻塞判断。

对 supervisor 的潜在价值：

- 支持“持续推进一个目标直到完成/阻塞”，而不是每轮都依赖用户继续催促。
- 给长任务提供清晰状态：目标是什么、还剩多少预算、为什么暂停或阻塞。
- 与 hindsight 互补：goal 管当前任务，hindsight 管项目级经验沉淀。

实现注意：

- goal continuation 可以由 supervisor 内置扩展驱动，不需要嵌进 pi-coding-agent。
- 预算统计需要接入模型 usage、turn 计数和 wall clock。
- 需要防止目标文本变成高优先级指令；Kimi 把 objective 包在 untrusted 标签里注入。

supervisor 落地建议：

- 按“核心支持的内置扩展”实现。
- 扩展注册 `CreateGoal` / `GetGoal` / `UpdateGoal` / `SetGoalBudget`。
- goal 状态存到 session 级 storage 或 session meta，包括 objective、completionCriterion、status、budget、usage。
- 扩展监听 `turn.ended` / `agent_end`，当 goal 仍为 `active` 且预算未耗尽时，调用 `ctx.flow.continue()` 或现有 `ctx.sendUserMessage()` 续跑。
- 核心扩展 API 最好提供 `ctx.flow.continue()`、`dedupeKey`、`acquireLock()`、`getUsage()`，避免扩展手写防重入和预算统计。
- `paused`、`blocked`、`complete` 都由 `UpdateGoal` 改状态；`complete` 应写完成记录后清理当前 goal。

## 后续评估：TodoList 与动态提醒

Kimi-code 还有一个轻量任务跟踪工具 `TodoList`，和 plan/goal 都不同。参考实现：

- `../kimi-code/packages/agent-core/src/tools/builtin/state/todo-list.ts`
- `../kimi-code/packages/agent-core/src/agent/injection/todo-list.ts`

核心机制：

- `TodoList` 是模型可调用的结构化状态工具，支持读取、替换、清空 todo 列表。
- todo 项只有 `pending`、`in_progress`、`done` 三种状态。
- 长时间没有更新 todo 时，动态 injector 会温和提醒模型更新或清理 todo。

对 supervisor 的潜在价值：

- 比 plan mode 更轻，适合普通多步骤任务的进度展示。
- UI 可以直接显示当前 todo，而不是从 assistant 文本中解析。
- 可作为 goal mode 的辅助视图，但不应该代替 goal。

实现注意：

- 需要持久化到 session 工作目录或数据库。
- 应限制最多一个 `in_progress`，否则 UI 和模型都会变得含糊。
- 提醒应低频，避免污染上下文。

supervisor 落地建议：

- 可以纯扩展实现。
- 扩展注册 `TodoList` 工具，支持读取、替换、清空 todo 列表。
- 状态存到 session 级 storage。
- Web UI 订阅 todo 状态，直接展示结构化进度。
- 可监听 `turn.ended` 做低频提醒：长时间未更新 todo 时提示模型更新或清理。
