# Supervisor 内置 Coding Agent：按 Agent 构成拆解的差距分析

> 分析日期：2026-08-12
>
> 对象：仅分析 Supervisor 内置 `Coding` agent，不把 Supervisor 整个平台能力等同于该 agent 的默认能力。
>
> 样本：公开 GitHub star 约 1 万以上的 coding agent；star 只用于过滤知名度，不作为质量评分。

## 结论先行

Supervisor `Coding` 当前效果不好的核心，不是 Pi 的基础循环太弱，也不是缺少 `read/write/bash`。

它的真实形态是：

```text
短 Coding prompt
  + Pi AgentHarness 的通用 model → tool → result 循环
  + 一组基础工具
  + 若干彼此独立的 Supervisor 扩展
```

这已经是一个能工作的通用 tool-using agent，但还不是一个完整的 coding 求解器。缺少的是位于 Pi loop 之上的 **coding control plane**：任务分型、阶段状态、上下文策略、能力路由、验证反馈、重试预算、独立验收，没有被组成一个默认闭环。

最重要的判断是：

1. **核心循环不是第一短板。** Pi 已提供标准 ReAct/tool loop、并行工具调用、steering/follow-up 和 hook 接口。Supervisor 不应先重写 loop。
2. **基础工具也不是第一短板。** 默认七件套足够完成一般编码；问题是 LSP、ast-grep 等精确能力不是 `Coding` 的默认绑定，而且工具没有被阶段化调度。
3. **增强能力“有组件、没成系统”。** Todo、Plan、Goal、Skill、Subagent、Shadow memory 都能在代码中找到，但它们没有共同维护一个任务状态，也没有共同决定下一阶段与完成条件。
4. **最大的运行时差距是特殊工作流。** MiMo Compose 不只是一个 prompt：它有任务 DAG、隔离 worktree、并行实现、TDD、结构化验证、有限修复、独立 review 和 merge gate。Supervisor 只有模型可选择调用的 Plan/Goal/Subagent 工具。
5. **最大的质量差距是完成判定。** Supervisor 的验证主要是一条 prompt 要求，Goal 也由工作 agent 自己声明完成；MiMo `/goal` 使用独立 judge，Compose workflow 用验证与 review 的结构化结果控制是否继续。
6. **最明确的接线缺陷是 Skill。** `AgentResource` 能生成 `<available_skills>`，`skill` 工具又要求从该列表选技能，但 native session 构建 system prompt 时没有加入这段索引。

一句话概括根因：

> Supervisor 现在把“可调用能力”当成了“Agent 策略”；成熟 agent 则把能力编排成带状态、证据和停止条件的求解流程。

---

## 1. 一个 Coding Agent 应拆成哪些关键元素

用户给出的四项是正确起点，但“记忆”和“task”不应只视为两个特殊工具，“验证/停止”也不能藏在核心 loop 中。为了定位效果差距，本文使用七层模型。

| 层 | 关键问题 | 典型实现 |
|---|---|---|
| 1. 执行内核 | 如何反复调用模型、执行工具、回填结果、接收中途输入、停止一轮？ | Agent loop / harness |
| 2. 感知与上下文 | 每轮模型看见什么？如何理解 repo、指令、历史、长任务状态？ | system prompt、AGENTS、repo map、checkpoint、compaction |
| 3. 基础动作 | 能否可靠读、搜、改、写、运行命令？ | read/grep/edit/write/bash/LSP |
| 4. 认知与状态工具 | 如何外化计划、任务依赖、记忆、子任务和长期进度？ | todo/task/memory/skill/subagent |
| 5. 求解策略与模式 | 不同任务采用什么流程，阶段如何转换？ | build/plan/debug/review/compose/architect |
| 6. 反馈与恢复 | 如何知道一步是否有效，失败后如何换策略？ | lint/test、semantic loop detection、retry、rollback、reflection |
| 7. 完成判定与评测 | 谁证明需求已满足？系统怎样持续知道 agent 变好了？ | acceptance evidence、独立 judge、repo-level eval |

其中：

- 第 1 层解决“Agent 能不能跑”。
- 第 3 层解决“Agent 能不能动手”。
- 第 5～7 层决定“Agent 是否稳定把软件任务做对”。

Supervisor 的能力主要集中在 1、3 和平台扩展接口；当前效果差，主要发生在 2、4、5、6、7 的衔接处。

---

## 2. Supervisor 内置 Coding 的真实构成

### 2.1 实际执行链

`Coding` 在 registry 中只定义了名称、描述和 `toolsPreset: "coding"`；prompt 来自 `agents/coding/prompt.md`（`packages/supervisor/src/agent/builtin/registry.ts:100-104`）。一次 native session 的主链是：

```text
Coding 配置与 prompt
  → AgentResource.load()
  → pi-agent-core AgentSession（会话树/存储）
  → createDefaultTools()
  → buildSystemPrompt()
  → pi-agent-core AgentHarness
  → Supervisor extension 注册工具、守卫与注入
  → model ↔ tools 循环
  → agent_end 后 compaction / Shadow / lifecycle
```

创建和恢复路径都直接实例化 `AgentHarness`，只传入 `env/session/model/systemPrompt/tools/apiKey`（`session-manager.ts:780-806`、`1084-1110`）。因此要严格区分：

- Supervisor 使用了 **pi-agent-core 的低层 harness/session**。
- Supervisor 没有直接使用 **pi-coding-agent 的完整高层 `AgentSession`**。
- Supervisor 自己重做了存储、扩展、权限、rolling compaction、session lifecycle 等部分。

所以不能简单说“Supervisor 就是 Pi”，也不能说“换掉 Pi loop 就会变好”。准确说法是：Supervisor 借了 Pi 的执行内核和基础工具，但 coding policy 主要由自己负责，而这一层目前很薄。

### 2.2 第 1 层：Pi 核心循环——合格，不是根因

Pi 的 loop 包含：

- assistant 生成 tool call 后执行工具并把结果回填，直到没有 tool call（`pi/packages/agent/src/agent-loop.ts:153-275`）。
- 支持用户 steering message 和 agent 停止后的 follow-up message（同文件 `166-190`、`262-271`）。
- 工具默认并行；全局指定 sequential 或任一工具声明 sequential 时才串行（同文件 `413-427`；默认值见 `types.ts:252-259`）。
- 提供 `transformContext`、`beforeToolCall`、`prepareNextTurn`、`shouldStopAfterTurn` 等控制点。

这已经覆盖通用 agent 内核应有的大部分机制。它的限制是：内核不知道“现在处于分析、实现还是验证阶段”，也不知道“用户验收条件是否满足”。这本来就应该由上层策略负责。

#### Supervisor 从 Pi 得到了什么、没有得到什么

| 能力 | Pi 低层 Harness | pi-coding-agent 高层 Session | Supervisor Coding |
|---|---|---|---|
| model/tool 循环 | 有 | 使用 | 直接使用 |
| 并行工具、steering、hooks | 有 | 使用 | 可使用，部分由扩展接入 |
| 动态按工具重建 system prompt | 接口可支持 | 有，加入 tool snippets/guidelines | 没有等价主链 |
| Skills 与 context files 接入 prompt | 不负责 | 高层 Session 负责 | context files 有；Skills 索引未接上 |
| 自动 compaction | 不负责 | 有 | Supervisor 自己实现 rolling compaction |
| 普通可重试 LLM 错误指数退避 | 不负责 | 有（`agent-session.ts:2570-2637`） | 未看到等价自动机制；当前提供手动 retry，overflow 另行恢复 |

pi-coding-agent 的高层 Session 会依据当前工具、skills 和 context files 重建 prompt（`pi/packages/coding-agent/src/core/agent-session.ts:983-1016`），并包含自动 retry 和 compaction。Supervisor 绕过它不是错误——平台需要自己的持久化和扩展——但这意味着必须完整接回这些高层语义。目前 Skills 和普通 LLM retry 就暴露了接线缺口。

**本层判断：不要先重写 Pi loop。应在它上面增加明确的 workflow controller，并补齐绕过高层 Session 后遗漏的行为。**

### 2.3 第 2 层：感知与上下文——有项目指令和压缩，缺任务语义

Supervisor system prompt 只拼接 session override、Agent `systemMd` 和从 cwd 向父目录查找的 `AGENTS.md` / `CLAUDE.md`（`session-manager.ts:558-560`，`agent/context-files.ts:5-55`）。它还有 rolling compaction，在 agent 结束后按阈值压缩，并为 context overflow 做一次恢复（`core/compaction/rolling.ts`、`core/session-lifecycle.ts:243+`）。

已有能力：

- 项目级指令可以进入系统提示。
- 会话树持久化、恢复和一般性压缩是完整的。
- Shadow 可在每轮结束后维护一份 session 级影子记忆，并在必要时向主会话发提醒（`extension/builtin/shadow/runner.ts:71-157`）。

关键缺口：

- 没有默认 repo map、symbol relevance ranking 或 task-relevant context budget；主要依靠模型自己 `grep/read`。
- rolling compaction 是通用历史摘要，不是“验收条件、未完成任务、已验证证据、失败假设、活跃资源”这些 coding invariant 的结构化 checkpoint。
- Shadow 默认需 session 启用，且它的 memory 主要供 Shadow 下一轮读取；主 `Coding` 没有直接的 memory read/write/search 工具，也没有每轮稳定注入的项目记忆。
- session 恢复优先复用已保存的 `session.systemPrompt`（`session-manager.ts:794-797`）；这不是一个按当前工具、技能、目录状态每轮重建的动态 prompt。

与 MiMo 的本质差别不是“都有 summary 文件”：MiMo 的 checkpoint writer 专门维护当前工作、directives、错误/修复、设计决定、活跃任务等结构，并在接近窗口上限时从 checkpoint、项目 memory、任务进度和近期消息重建上下文（`MiMo-Code/packages/opencode/src/session/checkpoint.ts`，尤其 `1083-1305`）。它保存的是继续完成任务所需的状态，而不只是聊天摘要。

### 2.4 第 3 层：基础工具——够用，但精确能力不是默认组成

`coding` preset 的默认工具是：

```text
read / bash / edit / write / grep / find / ls
```

其中 `read/bash/edit/write` 来自 `@earendil-works/pi-coding-agent`，Supervisor 补入 `grep/find/ls`，并用支持前台/后台任务的 bash 替换 Pi bash（`utils/default-tools.ts:53-103`）。

这套基础动作并不弱。Aider、Codex、Gemini、MiMo 的工具名字会更多，但多数编码任务的瓶颈不是少一个写文件函数。

真正需要区分的是“仓库里存在”与“内置 Coding 默认得到”：

- Supervisor 另有 `lsp`、`ast-grep`、增强 `edit`、`web`、`browser`、`output-minimizer` 等 packaged tools（`tools/catalog.ts:5-15`）。
- native runtime 只会激活 Agent 显式绑定的 `kind=tool` 资源（`session-runtime.ts:209-216`）。
- 内置扩展的 ensure 逻辑只自动绑定 `kind=extension`，没有给 `Coding` 自动绑定 packaged tools（`extension/builtin/ensure.ts:28-43`）。
- 当前工作区 `.supervisor/supervisor.db` 中，`Coding` 的资源绑定只有 `kind=extension`，没有 `kind=tool`、`kind=skill` 或 `kind=mcp` 资源。

因此当前默认画像应写成“七个基础工具 + 内置扩展按条件注册的工具”，不能把 catalog 中的所有工具都算成 `Coding` 已有能力。

**本层判断：基础工具不是根因；LSP/ast-grep 默认化和输出压缩是有价值的 P1 增强，但单独做不会让 Agent 发生质变。**

### 2.5 第 4 层：Task、Goal、Skill、Subagent、Memory——组件存在，认知链未闭合

#### Task / Plan / Goal

`task-management` 注册了六个工具：`TodoList`、`Goal`、`EnterPlanMode`、`UpdatePlan`、`ExitPlanMode`、`CompletePlan`（`extension/builtin/task-management/index.ts:13-20`）。它并非空壳：

- Plan planning 阶段限制可见工具，并通过守卫阻止非计划写操作。
- Plan 批准后要求转成 Todo 并执行，完成时要求验证（同文件 `210-245`）。
- Goal 会持久化 artifact，并在每轮结束后调用 `ctx.flow.continue`，直到 agent 自己标为 complete 或 blocked（`310-332`、`375-461`）。

但它缺少三样决定质量的状态：

1. Todo 只是标题和状态，没有依赖、文件所有权、验收条件和验证证据。
2. Coding prompt 没有可靠的复杂度分型规则来决定何时进入 Plan/Goal；是否使用仍由同一个工作模型临场决定。
3. `Goal complete` 是工作 agent 自我声明，没有独立验收者检查 diff、测试输出和用户条件。

所以它是一个不错的持久化任务 UI/控制接口，还不是求解策略。

#### Skill

这里存在明确的功能性断点：

1. `formatSkillsForPrompt()` 能生成 `<available_skills>`（`agent/skills.ts:343-362`）。
2. `AgentResource.getSkillsPrompt()` 暴露该索引（`agent/runtime-resources.ts:139-146`）。
3. `skill` 工具描述要求模型从 `<available_skills>` 选择技能（`extension/builtin/skill/index.ts:42-50`）。
4. 但 native session 的 `buildSystemPrompt()` 没有 skills 参数，创建与恢复路径也没有调用 `getSkillsPrompt()`；全仓源码调用只出现在单测。

因此即便绑定了 skills，模型也没有稳定的自主发现列表。用户通过 slash command 显式加载不等于 Agent 能自行路由技能。

#### Subagent

`spawn_agent` 支持创建或继续 child session、前后台运行、等待结果和查询状态，运行设施本身比较完整（`extension/builtin/subagent/index.ts:95-224`）。但新建 child 时只能从 `findByRole("spawned")` 找到预配置 Agent；没有配置就会返回 available: none。

当前内置 `Coding` 的 meta 为 `{}`，数据库也没有 spawned Agent 绑定。因此“仓库有 subagent extension”和“默认 Coding 会合理委派”是两回事。它还缺少：

- 默认 explorer / implementer / reviewer 角色。
- 基于任务依赖与文件冲突的调度器。
- 子 Agent 输出 contract、证据校验和结果合并策略。

#### Memory

Supervisor 有 Shadow memory，但 `Coding` 本身没有像 MiMo 那样可搜索、可分层、稳定注入的 session/project memory。Shadow 更接近异步观察者：它在 agent_end 后读取最新一轮和自己的 memory，选择是否更新 memory 或给主 agent 发一条消息。它不是主求解循环随时可访问的工作记忆。

**本层判断：Supervisor 的问题不是没有这些名词，而是它们没有共享同一个 task state，也没有形成“发现 → 选择 → 执行 → 验收”的认知链。**

### 2.6 第 5 层：特殊模式与工作流——当前最大缺口

内置 `Coding` 只有一个通用身份。它的简短 prompt 要求最小改动、并行只读探查和完成前验证，这些是好习惯，但不是阶段化求解器（`agents/coding/prompt.md`）。

Supervisor 的 Plan/Goal 是模型可调用的工具状态；这与独立模式有本质区别：

| 维度 | Supervisor Plan/Goal | 独立 workflow/mode |
|---|---|---|
| 触发 | 模型或用户主动调用工具 | 路由器/用户选择后进入明确策略 |
| 状态 | planning / executing / goal active | 多阶段状态机、输入输出 contract |
| 阶段产物 | plan artifact、todo | spec、task DAG、diff、验证证据、review verdict |
| 调度 | 同一个模型自行决定下一步 | runtime 决定阶段、并发、重试和门禁 |
| 完成 | agent 调 `CompletePlan` / `Goal complete` | 验证器或 judge 满足条件才放行 |

这正是 Supervisor `Coding` 与 MiMo Compose 的最大结构差距。

### 2.7 第 6～7 层：反馈、恢复与完成判定——有安全网，没有质量门

Supervisor 当前有：

- prompt 要求修改后运行测试/启动/复现，并诚实报告未验证。
- tool-loop-guard：连续相同参数且相同结果时警告/阻断；polling 有单独阈值（`extension/builtin/tool-loop-guard/index.ts:84-147`）。
- rolling compaction 和一次 overflow 恢复。
- LLM error 后的手动 retry：删除 error leaf 并 `agent.continue()`（`session-manager.ts:2891-2926`）。
- session checkpoint/commit 和可选 Shadow 提醒。

但没有默认的：

- 编辑后由 runtime 自动运行 lint/test 并把失败作为下一轮输入。
- “验证命令确实执行且通过”这一完成门。
- 跨不同参数/不同文本的语义停滞检测。
- 普通限流/服务错误的自动指数退避。
- 对错误类型进行分类后选择 retry、replan、rollback 或 ask。
- 独立模型/角色根据 acceptance criteria 审核完成度。

因此当前控制流更接近：

```text
模型说要做什么
  → 工具返回结果
  → 同一个模型解释结果
  → 同一个模型决定是否继续
  → 同一个模型决定是否完成
```

这会放大同一个模型的乐观偏差：一旦它误判“已经修好”，系统没有第二条证据链纠正它。

---

## 3. 高 Star Agent 在相同七层上的做法

### 3.1 样本筛选

截至分析日，当前已 clone 且约 1 万 star 以上的样本包括：OpenCode 196k、Gemini CLI 106k、Codex 105k、OpenHands 83k、Cline 66k、Goose 52k、Aider 48k、Crush 27k、Qwen Code 26k、SWE-agent 20k、MiMo-Code 12.7k、Trae Agent 12k。Pi 作为 Supervisor 的直接依赖基线保留，不用 star 衡量。

下面不逐仓库罗列 feature，而是选出各层最有区分度的实现。

### 3.2 MiMo-Code：把“特殊操作”做成两种可执行机制

MiMo 有两层 Compose，不能混为一谈。

#### 交互式 Compose Agent

它是独立 primary agent，与 build、plan 并列注册（`MiMo-Code/packages/opencode/src/agent/agent.ts:124-214`）。Compose prompt 强制：

- 匹配 skill 时必须先加载技能，不能仅凭描述跳过。
- 决策和澄清必须走 `compose:ask`，不能用自然语言问题直接结束回合。
- 完成前必须有真实代码变更、真实验证调用和最小实现。
- Compose skills 有明确优先级和中途恢复规则。

关键不是 prompt 更长，而是它有专用技能集合，prompt 中确实注入 `<available_skills>` 和文档输出目录（`session/prompt/compose.txt:1-130`、`session/prompt.ts:566-584`）。

#### 确定性 Compose Workflow

这是更值得 Supervisor 借鉴的部分。它不是让一个模型自由决定步骤，而是 JavaScript runtime 固定执行：

```text
Brainstorm
  → Design（spec + plan + task DAG）
  → Implement（拓扑批次；独立任务并行、各自 worktree；TDD）
  → Verify（结构化测试/类型检查/build 结果）
  → Review（先验收符合度，再代码质量）
  → Report
  → Merge
```

源码中的系统保证包括：

- 阶段和输出 schema 明确定义（`workflow/builtin/compose.js:1-127`）。
- 设计结果抽取成带 `dependsOn` 和 `acceptance` 的任务，并做拓扑排序（`335-402`）。
- 并行任务自动使用独立 worktree，完成后集成（`416-439`、`480-520`）。
- 每个实现任务强制加载 TDD skill（`416-428`）。
- 验证返回 `tests/typecheck/build/allPassed` 结构，最多三轮 implement → verify → debug（`441-458`、`523-570`）。
- Review 先根据 diff 和 acceptance 做 spec compliance，再做 code quality；critical issue 最多修两轮并重新验证、重新 review（`572-665`）。
- 没有通过 verify/review 就不会进入成功 merge（`701-729`）。

MiMo 还用独立 judge 实现 `/goal`：主 runLoop 拒绝停止，直到另一次冷模型调用认为目标满足或确实不可能（`session/goal.ts:16-36`）。

这带来的核心差异是：

> Supervisor 的工具告诉模型“你可以规划、委派、验证”；MiMo workflow 的 runtime 决定“你现在必须规划，满足 schema 后才能实现，验证失败必须有限重试，review 未过不能完成”。

Compose 并非所有任务都适用：它调用昂贵、阶段多、默认 merge 行为需要严格权限，简单修复会显得过重。正确借鉴方式不是让所有任务都跑 Compose，而是增加复杂度路由，并保留轻量 Build 流程。

### 3.3 Aider：基础 loop 简单，但编辑反馈是系统行为

Aider 展示了另一个方向：不需要复杂多 Agent，也能通过两个确定性机制提高稳定性。

1. `RepoMap` 用 Tree-sitter tags 和相关性排序，在 `max_map_tokens` 预算内提供跨文件结构（`aider/aider/repomap.py:42-145`、`365+`、`576+`）。这是第 2 层“感知算法”，不是让模型盲目多 grep。
2. `BaseCoder` 编辑后默认 auto-lint，可配置 auto-test；错误写入 `reflected_message` 回到模型，反思最多三轮（`aider/aider/coders/base_coder.py:101-106`、`933-944`、`1596-1622`）。这是第 6 层 runtime feedback。
3. Architect mode 把提出方案与具体编辑交给不同阶段/模型（`coders/architect_coder.py:6-48`）。

Supervisor 当前对应的是“给模型 grep/bash，并在 prompt 里提醒测试”。Aider 则把 repo 感知和编辑后反馈做成系统保证。它说明 Supervisor 不一定要先复制 Compose；先实现一个轻量的强制 verification loop，也会有明显收益。

### 3.4 Gemini CLI / Qwen Code：把上下文、调度和停滞检测做成服务

Gemini CLI 的代表性机制：

- `HierarchicalMemory` 区分 global、user-project、extension、project 等层（`gemini-cli/packages/core/src/config/memory.ts:7-35`）。
- 工具 Scheduler 明确调度读写工具，并对连续只读工具并行、写操作串行有测试覆盖（`packages/core/src/scheduler/scheduler_parallel.test.ts`）。
- `LoopDetectionService` 同时检查流式文本重复、工具行为与长轨迹；30 turns 后按动态间隔调用快速模型，并可用主模型 double-check（`services/loopDetectionService.ts:35-65`、`254-303`、`563-699`）。
- Chat compression、subagent 与 model routing 都是 core service，而不是仅靠 prompt 建议。

Qwen Code 沿用了 Gemini 系架构并继续扩展 agent/team/goal 能力。二者给 Supervisor 的启示是：第 6 层不能只检测“完全相同的 tool args”；应检测目标是否推进、文本是否循环、假设是否反复，并给出一次受控 replan 机会。

### 3.5 Codex：统一 policy，而不是插件名词的集合

Codex 同样使用通用模型/工具循环，但把以下能力纳入统一 agent policy 和 core lifecycle：

- AGENTS/skills/plan/apply_patch/sandbox 共同组成动态工作上下文。
- compaction 是明确的 core task 和 token-budget 生命周期（`codex/codex-rs/core/src/compact.rs`、`compact_token_budget.rs`）。
- 多 Agent 有原生 spawn/control/communication 和 fork context（`codex-rs/core/src/agent/control/spawn.rs`）。
- 计划、协作、权限与验证规则在 system policy 中共同约束行为。

Supervisor 表面上也有这些名词，差别在默认整合度：Codex 的 agent 在启动时就知道可用 skills、协作规则和完成纪律；Supervisor 的 `Coding` 需要模型自己发现分散工具，其中 Skills 发现链当前还是断的。

### 3.6 其他高 Star 样本补充了哪些层

| Agent | 最有代表性的层 | 对 Supervisor 的直接启示 |
|---|---|---|
| SWE-agent | 轨迹/观察历史 | `LastNObservations`、closed-window processors 针对旧代码观察过期问题，不只做通用聊天摘要（`sweagent/agent/history_processors.py`） |
| Trae Agent | step feedback | 工具结果后显式 `reflect_on_result()`，把观察—反思写回轨迹（`trae_agent/agent/base_agent.py`） |
| Goose | 状态与恢复 | 独立 context-management 和 agent state machine，retry/max-turn/unknown-tool 等是显式状态 |
| OpenHands | 事件式控制器 | action/observation、condensation 和 Agent Server 状态是 agent runtime 的一等事件 |
| Cline | checkpoint 与模式 | checkpoint restore/diff、rules/hooks 和 Plan/Act 让恢复与操作边界可见 |
| OpenCode / Crush | 模式与可扩展工具 | 提供成熟的 build/plan/agent 配置与工具生态；MiMo 正是在 OpenCode 基础上增加 memory、goal、compose 等控制层 |

这些项目的实现路线不同，但共同点不是“工具更多”，而是把某一类高频失败从模型自觉提升为 runtime 机制。

---

## 4. 同一构成框架下的总对照

| 元素 | Supervisor Coding | Pi 完整 coding-agent | MiMo-Code | Aider | Gemini / Qwen | Codex |
|---|---|---|---|---|---|---|
| 1. 执行内核 | Pi Harness；通用循环完善 | 同一内核 + 高层 session 管理 | OpenCode loop + workflow runtime | coder loop | core client + scheduler | core turn loop |
| 2. 感知/上下文 | AGENTS/CLAUDE + 通用 rolling summary；Shadow 间接记忆 | 动态工具 prompt、skills、context files、compaction | checkpoint writer + project/task memory +预算重建 | ranked repo map | 分层 memory + compression | 动态 instructions/skills + compaction lifecycle |
| 3. 基础工具 | 默认七件套；LSP/ast-grep 非默认绑定 | 七件套 | 丰富 edit/search/LSP/workflow/skill | 专用 edit formats + repo map | 丰富 core tools + scheduler | shell/read/apply_patch 等成熟工具 |
| 4. 状态/增强工具 | Todo/Plan/Goal/Skill/Subagent 分散；默认发现/配置有断点 | extension/skills 体系 | task DAG、actor、memory、skill、goal judge | chat/edit state；architect/editor | memory、scheduler、subagents | plan、skills、multi-agent control |
| 5. 模式/workflow | 一个通用 Coding；Plan/Goal 是可选工具状态 | 主要是交互 coding session | build/plan/compose/max + 确定性 Compose | edit mode + Architect | 主 agent + subagent/model roles | plan/collab 等统一 policy |
| 6. 反馈/恢复 | prompt 验证；精确重复 guard；overflow 恢复；普通错误手动 retry | auto retry + compaction | TDD、结构验证、有限 debug/fix、semantic text-loop recovery | auto lint/test + 最多 3 次 reflection | 启发式 + LLM loop judge | tool/permission/error/compaction 恢复完善 |
| 7. 完成/评测 | 工作 agent 自己宣布完成；微型 tool tests 为主 | 工作 agent 停止 | verify + cold review；Goal 独立 judge | lint/test 结果反馈 | loop judge 与大量 core behavior tests | 强完成纪律与产品级 eval |

从这张表可见：

- Supervisor 与成熟项目在第 1、3 层差距不大。
- 第 2、4 层是“已有基础但接线不足”。
- 第 5、6、7 层是决定实际成功率的一阶差距。

---

## 5. 为什么 Supervisor Coding 实际效果不好：根因排序

### 根因 1：没有默认的 coding solver / workflow controller

Pi loop 只回答“下一次模型调用和工具调用如何发生”。Supervisor 还没有一层明确回答：

- 这是问答、简单 patch、debug、复杂 feature 还是 review？
- 需要先复现、先设计还是可直接改？
- 哪个阶段允许写？
- 当前阶段必须产生什么结构化产物？
- 何时并行，哪些文件不能并行写？
- 验证失败回到实现、debug 还是重新规划？
- 最多重试几次，何时向用户报告阻塞？

这些决定现在主要落在短 prompt 和工作模型临场判断上。模型能力稍弱、任务稍长或上下文稍乱，行为就会明显漂移。

### 根因 2：完成是自我判断，不是证据判断

当前 `Coding` prompt 虽要求验证，但 runtime 不检查是否存在验证 tool call，更不理解测试结果。`Goal` 的 continue 能防止单轮过早停止，却仍由同一 agent 调 `Goal complete`。

稳定完成至少需要三类证据：

```text
用户条件 → acceptance criteria
代码变更 → diff / files / implementation evidence
运行结果 → tests / typecheck / reproduction evidence
```

然后由独立 verifier，或至少由不可被工作 agent 绕过的规则，决定能否完成。MiMo Goal judge 和 Compose review 正是在消除同源乐观偏差。

### 根因 3：能力以资源存在，但没有可靠的默认 discoverability 与 routing

三个最清楚的例子：

- LSP/ast-grep 在 catalog 中，但默认 Coding 没有 tool binding。
- Skill tool 存在，但 `<available_skills>` 没进入 native system prompt。
- Subagent tool 存在，但默认没有 spawned roles，也没有调度策略。

这不是简单的“配置问题”，而是 Agent 产品边界问题：内置 Agent 的默认 profile 必须是闭合的。不能把用户手工配齐后可能具备的能力，计入开箱默认效果。

### 根因 4：Task、Memory、Compaction 没有共同维护任务不变量

长任务中最该持续保存的不是普通聊天摘要，而是：

- 用户目标和验收标准。
- 当前 phase、计划版本和依赖图。
- 已修改文件与所有权。
- 已验证/未验证项及原始证据。
- 失败尝试、被否定假设和下一步。
- 子 Agent 进度与待合并结果。

Supervisor 的 Todo、Goal artifact、rolling summary、Shadow memory 分别保存一部分信息，但没有一个统一 `CodingTaskState`。压缩或恢复后，模型需要从多种松散文本重新推断状态。

### 根因 5：反馈保护停留在“重复调用”，没有判断“是否推进目标”

完全相同 tool call 的 guard 能避免低级死循环，却识别不了：

- 在三个文件间来回读但没有形成新假设。
- 不断换 grep 关键词搜索同一事实。
- 测试重复失败但只做表面改动。
- 反复声称“应该好了”却没有新证据。

成熟机制会在无进展时触发 reflect/replan，或者用另一个模型判断 trajectory。Supervisor 目前缺的是 semantic progress evaluator，不只是更低阈值的 loop guard。

### 次要差距：Repo 感知和精确代码工具

Aider repo map、默认 LSP/ast-grep、子目录动态 instructions 都有价值，尤其对跨文件任务。但它们排在上述根因之后：给一个没有阶段和验收门的 agent 更多上下文，可能只会让它更快地做出未经验证的修改。

---

## 6. Supervisor 应该形成的目标 Agent 架构

不建议把所有任务强行塞进重型 Compose，也不建议替换 Pi。目标应是“一个内核，多种受控策略”。

```text
                         ┌─ Answer：只读回答
用户请求 → Task Router ─┼─ Build：侦察 → 实现 → 验证 → 完成
                         ├─ Debug：复现 → 假设 → 修复 → 回归
                         ├─ Review：只读 diff → findings → verdict
                         └─ Compose：设计 → DAG → 并行实现 → 验证 → 审查 → 集成

每种模式共同使用：
Pi AgentHarness + Supervisor tools/extensions + CodingTaskState + Evidence Gate
```

### 6.1 保留 Pi 作为执行内核

继续使用 Pi 的 model/tool loop、并行调用、steering 和 hook。Supervisor 需要新增的是 `CodingWorkflowController`，负责：

- 选择 mode。
- 切换 phase 和工具权限。
- 注入当前 task state。
- 检查阶段输出 schema。
- 执行有限重试和恢复。
- 在完成前调用 verifier。

### 6.2 定义统一 CodingTaskState

建议最小结构：

```ts
type CodingTaskState = {
  mode: "answer" | "build" | "debug" | "review" | "compose";
  phase: string;
  objective: string;
  acceptance: Array<{ id: string; text: string; status: string; evidence?: string[] }>;
  tasks: Array<{
    id: string;
    title: string;
    dependsOn: string[];
    files?: string[];
    status: string;
    ownerSessionId?: number;
  }>;
  changedFiles: string[];
  verification: Array<{ command: string; exitCode: number; summary: string; at: number }>;
  failedHypotheses: string[];
  retryBudget: Record<string, number>;
};
```

Todo、Goal、checkpoint、subagent 和 verifier 都读写这一个状态，而不是各自维护松散文本。

### 6.3 至少提供四种策略

#### Build（默认轻量）

```text
Recon → Implement → Verify → Evidence Gate
```

- 小任务不强制写长 plan。
- 一旦发生文件修改，完成前必须至少有一条合适验证证据，或明确记录为什么无法验证。
- 验证失败进入最多 N 次 repair，而不是立即结束。

#### Debug

```text
Reproduce → Hypotheses → Discriminate → Fix → Regression Verify
```

- 没有复现证据时不能直接把猜测当根因。
- 每次失败记录被否定假设，避免同义循环。

#### Review

```text
Scope/Diff → Acceptance Review → Correctness Review → Findings/Verdict
```

- 默认只读。
- findings 必须附文件/行/证据；不自动实现，除非用户要求。

#### Compose（复杂任务）

借鉴 MiMo 的控制结构，但适配 Supervisor：

```text
Clarify/Recon
  → Spec + acceptance
  → Task DAG + file ownership
  → worktree-isolated subagents
  → integrate
  → verify
  → independent review
  → user-authorized commit/merge
```

与 MiMo 不同，commit/push/PR 不应是默认尾阶段；Supervisor 现有安全边界要求外部/共享状态操作先获得授权。

### 6.4 完成门必须独立于工作模型的自然语言

最低可行版本不一定需要额外大模型，可以先做规则 gate：

- 有改动但没有验证记录 → 不允许完成，回注“缺少验证证据”。
- 验证最近一次失败 → 不允许完成。
- Todo/acceptance 尚未完成 → 不允许完成。
- Agent 声称 blocked → 要求记录阻塞证据和已尝试替代路径。

再增加一个低成本独立 verifier：只读 objective、acceptance、diff、verification log，返回结构化 `{ok, missing, reason}`。工作 agent 不能直接覆盖 verdict。

---

## 7. 改造优先级

### P0：先补求解闭环，而不是继续加工具

1. 修复 Skills 索引注入，让绑定 skill 真正可发现。
2. 为内置 Coding 增加轻量 Build 状态机：Recon → Implement → Verify → Done。
3. 把验证记录结构化，并在有代码改动时设置 evidence gate。
4. Goal completion 改为独立 verifier 或不可绕过的规则 gate。
5. 增加普通可重试 LLM 错误的自动指数退避，保留次数上限。

P0 完成后，Supervisor 即使不做 Compose，也会从“模型自觉”升级为“系统闭环”。

### P1：让增强能力成为默认完整 profile

1. 为 `Coding` 默认绑定增强 edit、LSP、ast-grep 和 output minimizer；按可用性降级。
2. 内置 explorer、implementer、reviewer 三种 spawned role，不要求用户先配置。
3. 扩展 Todo 为 task DAG，加入 acceptance、dependsOn、files、owner、evidence。
4. 建立结构化 checkpoint，将 task state 与最近必要消息重建进上下文。
5. 增加 semantic progress/loop detector，触发一次 reflect 或 replan。

### P2：实现 Supervisor Compose

1. 先做可中断、可观察的 workflow controller，不要只写一份更长 prompt。
2. 以 task DAG 和文件所有权决定是否并行；并行写必须隔离 worktree。
3. 阶段之间只传结构化产物，限制重试次数。
4. Verifier 与 reviewer 使用独立 session/model context。
5. commit/push/merge 继续受 Supervisor 权限和用户授权控制。

### P3：建立 repo-level 评测闭环

现有单工具 AI tests 只能证明工具能被调用，不能证明 Coding Agent 能完成任务。至少建立以下回归集：

- 跨文件 feature。
- 可复现 bug 修复。
- 测试先失败后修复。
- 错误初始假设后 replan。
- context compaction 后继续未完成任务。
- 两个可并行任务与一个文件冲突任务。
- 子 Agent 返回不完整结果时主 Agent 拒绝完成。
- Agent 口头声称完成但缺测试证据时被 gate 拦截。

指标至少包括 success rate、premature-stop rate、验证执行率、无进展 turns、重试成本和 regression rate。没有这些指标，继续增加 extension 只能证明平台变大，不能证明内置 `Coding` 变强。

---

## 8. 最终判断

### Supervisor 已经具备的基础

- Pi 的执行 loop 足够作为内核。
- 七个基础工具足够覆盖常规编码动作。
- Session、extension、worktree、permission、checkpoint 等平台底座很好。
- Task/Goal/Subagent/Shadow 已提供实现更强策略所需的大部分原语。

### Supervisor 与优秀 Coding Agent 的真正差距

不是少几个 API，而是少一个把这些原语组织起来的默认求解器：

```text
任务分型
  → 阶段状态
  → 上下文与能力路由
  → 有依赖的执行
  → 真实验证反馈
  → 有限恢复
  → 独立完成判定
```

MiMo Compose 是这个差距最完整的正例；Aider 的 repo map + lint/test reflection 则证明轻量方案也有效；Gemini 的 loop judge、分层 memory 与 scheduler 说明这些能力应该进入 runtime service；Codex 说明 skills、plan、tools、subagents 必须是一套统一 policy。

因此，Supervisor 下一步最不该做的是重写 Pi loop或继续堆孤立工具。最该做的是：

> 以现有 Pi Harness 为内核，先实现一个轻量但不可绕过的 Build/Verify/Evidence 闭环，再在同一状态模型上增加 Debug、Review 和 Compose。

这会直接改善内置 `Coding` 的完成质量，而不只是增加 Supervisor 平台的功能数量。

---

## 附录：本次源码快照

为避免后续仓库演进导致行号和结论混淆，本次深入引用的本地快照为：Supervisor `abd74c9`、Pi `b084d2fb`、MiMo-Code `c0f5490`、Aider `5dc9490`、Gemini CLI `4238b0b`、Codex `16fbfe5`。Star 数于 2026-08-12 通过 GitHub repository API 查询并按约 1 万下限过滤；它只决定样本是否纳入，不参与能力排序。
