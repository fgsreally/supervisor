# 根据 omp 和 kimi-code 设计子代理计划安排

本文记录 `supervisor` 子代理系统的取舍和实施计划。参考对象是上级目录中的 `oh-my-pi`（下文简称 omp）和 `kimi-code`，但最终设计必须服从 `supervisor` 当前的 SQLite session 模型。

## 基本判断

`supervisor` 的子代理不应该另起一套 agent-host 存储。正确模型是：

```text
一个子代理 = 一个子 session = sessions 表中的一条记录 = 自己独立的 messages
```

父子关系使用现有字段表达：

```text
sessions.parent_id = 父 session id
sessions.branch_type = "spawn"
sessions.agent_id = 子代理绑定的 Agent 定义
```

这样可以直接复用：

- `GET /sessions/:id/children`
- `GET /sessions/:id/tree`
- `POST /sessions`
- `POST /sessions/:id/prompt`
- `POST /sessions/:id/abort`
- SQLite messages 隔离
- Web UI session tree

## 应该做

### 1. 学 kimi-code 的 Agent 工具形态

kimi-code 的 `Agent` 工具很适合 `supervisor`。它不是让模型直接传数据库里的 `agentId`，而是用更自然的字段描述一次委派。

建议工具参数：

```json
{
  "description": "Review session API",
  "subagent_type": "review",
  "prompt": "检查 session HTTP API 的错误处理，只输出真实 bug。",
  "run_in_background": false
}
```

为什么好：

- `description` 给 UI 和日志显示。
- `subagent_type` 比 `agentId` 更适合模型使用。
- `prompt` 是子代理的明确任务。
- `run_in_background` 可以决定父代理是否等待。

对应到 `supervisor`：

```text
subagent_type = "review"
  -> 从当前父 session 的 spawned members 中找 tag=review 的 agent
  -> 创建 child session
  -> child session 执行 prompt
  -> 父代理收到 child session 的结果摘要
```

### 2. 支持创建子 session

创建子 session 的意思是：父代理把一块工作交给另一个 agent，系统在数据库里创建一个新的 session。

例子：

```text
Session 12: 主代理
  └─ Session 34: review 子代理
```

子代理拿到的是明确任务：

```text
请检查 packages/supervisor/src/http/http-server.ts 里 session API 的错误处理。
只报告真实 bug，不要改代码。
```

子代理完成后，父代理只拿摘要：

```text
子代理 34 完成：
- POST /sessions/:id/fork 缺少 entryId 校验
- GET /sessions/:id/commands 对冷 session 会返回 409
```

好处：

- 父代理上下文不会被子代理探索过程污染。
- UI 可以单独展开子 session 看完整过程。
- 搜索、审计、删除、resume 都有清晰边界。

### 3. 支持 resume 子 session

resume 子 session 的意思是：继续同一个子代理，而不是重新开一个。

例子：

```json
{
  "resume": 34,
  "prompt": "你刚才第二个问题再确认一下，有没有已有测试覆盖？"
}
```

Session 34 会继续使用自己的历史：

```text
它之前读过哪些文件
它为什么怀疑这里有问题
它已经形成了什么结论
```

好处：

- 长任务不会拆成一堆互相不知道的新子代理。
- review、迁移、调研、测试失败后的继续分析都更自然。
- 子代理可以作为一个可恢复的工作线程存在。

规则：

- resume 只能作用于当前父 session 的直接子 session。
- resume 目标必须是 `branch_type = "spawn"`。
- resume 时不能同时传 `subagent_type`，因为已有子 session 已经确定了自己的类型。
- 正在运行的子 session 不能被并发 resume。

### 4. 支持 foreground 和 background 两种运行方式

foreground：

```json
{
  "subagent_type": "review",
  "description": "Review session API",
  "prompt": "检查 session API。",
  "run_in_background": false
}
```

父代理会等待子代理完成，再收到结果。

适合：

```text
小范围 review
短调研
需要马上拿结论的任务
```

background：

```json
{
  "subagent_type": "explore",
  "description": "Scan migration risks",
  "prompt": "后台扫描子代理系统会影响哪些模块。",
  "run_in_background": true
}
```

父代理立即拿到：

```text
已启动后台子代理 Session 35。
```

适合：

```text
大范围搜索
长时间测试
不阻塞主线的探索
```

### 5. 学 omp 的结果结构和保护栏

omp 的 `task` 工具复杂，但结果模型值得学。

子代理结果不要只返回一段文本，应该至少包含：

```json
{
  "sessionId": 34,
  "agentId": 7,
  "status": "completed",
  "description": "Review session API",
  "durationMs": 42000,
  "truncated": false,
  "result": "发现 2 个问题..."
}
```

这样 UI、日志、父代理都能判断：

```text
成功了吗？
失败了吗？
超时了吗？
输出有没有被截断？
以后要 resume 哪个 session？
```

第一期应有这些保护：

- 最大递归深度：默认 1。
- 父 session 最大并发子代理数：默认 4。
- 子代理超时：默认 30 分钟。
- 工具结果最大字符数：默认 20000，完整内容仍保留在子 session 消息里。
- 子代理默认不再创建子代理。

### 6. 用 members 表做授权

不要让模型随便调用任意 agent。

正确方式：

```text
当前 session 的 members 中：
- role = "spawned"
- tags 包含 "review"
```

模型调用：

```json
{
  "subagent_type": "review",
  "prompt": "检查 HTTP API。"
}
```

系统解析：

```text
review -> 当前 session 授权的某个 agentId
```

好处：

- 模型不用知道数据库 id。
- 用户或编排器可以控制当前 session 能调用哪些子代理。
- 防止模型调用不该调用的 agent。

### 7. 子代理消息实时流回前端

子代理本质上仍然是一个普通 session，所以它的消息流、状态变化、工具调用、错误都应该沿用现有 session 事件模型。

要求：

```text
子代理创建后，前端能立刻看到 child session。
子代理运行时，Web UI 能实时看到它自己的 assistant/tool/message 流。
父 session 不需要等最终结果才知道子代理在做什么。
```

为什么有必要：

```text
foreground 子代理等待时间可能很长，如果 UI 只显示“等待中”，体验很差。
background 子代理更需要实时进度，否则用户不知道它是否卡住。
子代理出现 ask/waiting_user/error 时，前端应能直接定位到 child session。
```

实现建议：

```text
继续把子代理作为普通 session 推送事件。
session tree / children 列表监听到新 child 后自动展示。
child session 的流式输出只写入 child messages，不污染 parent messages。
父工具结果只返回摘要和 session id，不复制完整执行过程。
```

### 8. session finished 状态和一次性子代理

子代理 session 也是普通 session，但需要明确生命周期语义。

当前 session 状态里应保留一个特殊状态：

```text
finished
```

含义：

```text
finished = 这个 session 已经完成并归档，不再作为活跃工作线程继续使用。
```

两类子代理：

```text
一次性子代理:
  例如临时 review / scan / summarize。
  完成后写入 result，然后标记 finished。
  后续主要用于查看历史和审计，不建议 resume。

长期子代理:
  例如持续的 reviewer / researcher / test watcher。
  完成一次任务后可以保持 idle。
  后续允许 resume 继续同一个 child session。
```

工具参数可以显式表达：

```json
{
  "subagent_type": "review",
  "prompt": "检查 extension API",
  "finish_on_result": true
}
```

规则：

```text
finish_on_result=true:
  foreground 拿到结果后 child session 标记 finished。

finish_on_result=false:
  child session 完成当前 turn 后回到 idle，允许后续 resume。

background 子代理:
  也应支持 finish_on_result。
  如果任务自然完成且 finish_on_result=true，则自动 finished。
```

注意：

```text
finished 不是删除。
finished session 仍然能被 UI 展示、搜索、审计。
finished session 默认不再注入交互工具，不再接收普通 prompt，除非显式 unarchive/reopen。
```

### 9. 不引入内部资源 URL 协议

不提供 `pi-supervisor://`、`list_supervisor_resources` 或 `read_supervisor_resource`。
内置 Agent 通过已有资源能力直接查看所需内容，子代理工具只负责创建子 Session 并返回状态和结果。

## 暂停做

暂停做的意思是：以后可能有价值，但第一版不应该做。

### 1. 暂停做 yield / schema 输出

yield / schema 输出想解决的是：让子代理按固定 JSON 格式交作业。

例如 review 子代理必须输出：

```json
{
  "findings": [
    {
      "title": "fork 缺少 entryId 校验",
      "file": "http-server.ts",
      "line": 1035,
      "priority": 1
    }
  ]
}
```

为什么第一版暂停：

```text
子代理系统本身还没跑顺。
如果一开始就强制 JSON schema，会多出解析失败、校验失败、重试、部分提交等问题。
任务本身不复杂，但格式处理会变成主要复杂度。
```

第一版更简单：

```text
子代理最后输出一段总结。
父代理拿这段总结。
完整过程保存在子 session messages 中。
```

以后适合加入 schema 的场景：

```text
review 子代理固定输出 findings 数组
test 子代理固定输出 passed/failed/error
migration 子代理固定输出 filesChanged
```

### 2. 暂停做 AgentSwarm 大批量子代理

AgentSwarm 是一次开很多子代理。

例如：

```text
开 20 个子代理，分别检查 20 个模块。
```

为什么第一版暂停：

```text
单个子代理的创建、运行、完成、失败、取消、resume、展示还没稳定。
一开始就批量，会马上遇到部分成功、部分失败、部分超时、部分等待用户的问题。
```

第一版先支持：

```text
开一个 review 子代理检查 HTTP API。
```

第二期再支持：

```text
开 5 个 review 子代理分别检查 session / agent / provider / extension / web UI API。
```

### 3. 暂停做子代理独立 worktree

独立 worktree 的意思是：每个子代理有自己的代码副本，可以单独改代码。

例如：

```text
主代理在主 worktree
子代理 A 在 worktree-A 改登录功能
子代理 B 在 worktree-B 改设置页面
```

为什么第一版暂停：

```text
合并冲突复杂。
子代理提交归属复杂。
父 session complete 时是否合并子代理 worktree 不清楚。
当前 supervisor 根 session 已经有 worktree 生命周期，再套一层容易乱。
```

第一版建议：

```text
review / explore 子代理默认偏只读。
真正改代码优先由主代理执行。
```

以后再考虑：

```text
子代理生成 patch
父代理确认后应用 patch
或子代理独立 branch，父代理显式 merge
```

### 4. 暂停做自动 patch merge

自动 merge 的例子：

```text
子代理 A 改完代码，自动合并。
子代理 B 改完代码，自动合并。
```

为什么暂停：

```text
子代理可能改错文件。
子代理可能只改了一半。
测试可能没过。
多个子代理可能改同一行。
```

第一版更稳：

```text
子代理负责调查和建议。
主代理决定是否修改代码。
```

## 不该做

不该做的意思是：和 `supervisor` 架构冲突，学了会把系统搞乱。

### 1. 不该把多个子代理藏在一个 session 里

错误模型：

```text
Session 1: 主代理
  内部偷偷有：
  - agent-0
  - agent-1
  - agent-2
```

数据库里只有一个 session。

这和 `supervisor` 冲突。`supervisor` 应该是：

```text
Session 1: 主代理
  ├─ Session 2: review 子代理
  ├─ Session 3: explore 子代理
  └─ Session 4: test 子代理
```

如果照搬内存 agent-host，会出现：

```text
/sessions/1/children 看不到子代理。
UI 无法展示子代理树。
messages.session_id 无法隔离不同子代理。
搜索结果不知道来自哪个子代理。
无法单独删除、resume、abort 某个子代理。
fork / clone / tree 语义变复杂。
```

所以必须坚持：

```text
一个子代理就是一个子 session。
```

### 2. 不该允许子代理无限再开子代理

错误例子：

```text
主代理开 review 子代理。
review 子代理开 explore 子代理。
explore 子代理开 test 子代理。
test 子代理又开 debug 子代理。
```

问题：

```text
谁负责最终结果？
哪一层失败算失败？
用户应该看哪一个？
成本怎么控制？
最里面卡住时外层是否一直等？
```

第一版规则：

```text
主 session 可以创建子代理。
子代理默认不能再创建子代理。
```

如果未来要支持递归，也必须显式配置：

```text
planner 子代理允许再开 1 层。
review 子代理不允许再开。
```

### 3. 不该让模型直接指定任意 agentId

错误例子：

```json
{
  "agentId": 123,
  "prompt": "去改代码"
}
```

问题：

```text
模型不知道 123 是谁。
模型可能调用未授权 agent。
agentId 在不同数据库中不稳定。
工具描述对模型不友好。
```

正确例子：

```json
{
  "subagent_type": "review",
  "prompt": "检查 HTTP API。"
}
```

由系统解析：

```text
当前 session 的 spawned members 中，找到 review 对应的 agent。
```

### 4. 不该让子代理自动合并代码进主线

错误例子：

```text
子代理完成后，自动把修改合并到父 session。
```

问题：

```text
修改可能不完整。
测试可能没过。
多个子代理可能冲突。
父代理还没审查。
用户难以追踪是谁引入的变更。
```

第一版原则：

```text
子代理可以调查、review、建议。
代码变更由主代理或用户显式接管。
```

## 扩展 API 需要增加的能力

扩展运行时需要知道当前 session 是不是主 session，避免子代理继续创建子代理。

建议在扩展上下文中增加：

```ts
ctx.session.isMainSession(): boolean
```

或暴露只读字段：

```ts
ctx.session.kind: "main" | "subagent"
ctx.session.parentId: number | null
ctx.session.branchType: "spawn" | "fork" | "clone" | null
```

判断规则：

```text
isMainSession = session.parentId == null
```

更严格的子代理判断：

```text
isSubagent = session.parentId != null && session.branchType == "spawn"
```

工具注入规则：

```text
只有 isMainSession=true 的 session 默认注入 Agent 子代理工具。
branch_type="spawn" 的子 session 默认不注入 Agent 工具。
```

这样可以避免：

```text
主代理开子代理
子代理又开子代理
子代理的子代理继续开子代理
```

如果未来确实需要递归，应通过 agent/meta 显式开启：

```json
{
  "subagent": {
    "allowSpawn": true,
    "maxDepth": 1
  }
}
```

## 通过扩展实现，还是修改核心代码

结论：子代理的基础能力应该进入核心代码；扩展只负责使用或增强。

原因：

1. 子代理依赖 `sessions.parent_id`、`branch_type`、`members`、`messages` 隔离，这是核心数据模型。
2. 子代理需要和 `SessionManager.spawn()`、`prompt()`、`abort()`、`restoreRuntime()` 协同，这是核心生命周期。
3. foreground 子代理需要在父工具调用中等待 child session 完成，这需要核心 runtime 可靠支持。
4. background 子代理需要状态、事件、resume、kill，这些都已经是核心 session 能力。
5. 如果放在扩展里，各扩展可能各自实现一套 spawn 逻辑，最终和 session tree、UI、HTTP API 不一致。

合理分工：

```text
核心代码：
- SubagentCoordinator
- Agent 工具
- 子 session 创建/resume/等待/取消
- members 授权
- depth/concurrency/timeout
- 不新增 `/sessions/:id/subagents` API；授权和配置继续通过现有 members 接口处理
- extension context 中的 isMainSession / session kind

扩展：
- 定义某类子代理的提示词或策略
- 在 session start 时配置 spawned members
- 自定义结果渲染
- 未来增强 schema/yield/swarm
```

也就是说：

```text
子代理系统是 supervisor 的核心编排能力。
扩展系统只能作为上层插件入口，不能成为子代理生命周期的唯一实现。
```

## 分阶段计划

### 当前优先级建议

建议先做这些：

1. `subagent_type` 解析和 members 授权。

   现在如果工具直接暴露 `agentId`，模型使用体验和安全性都不好。第一步应把工具参数改成 `subagent_type` / `prompt` / `description`，再由系统从当前 session 的 `members.role="spawned"` 和 tags 解析具体 agent。

2. 子代理实时消息流和 UI 展示。

   子代理已经是普通 session，就应该先让 Web UI 能实时看到 child session 的消息、状态、工具调用和错误。这一步能直接改善体验，也能帮助调试后面的 foreground/background。

3. session 结果协议。

   先不要强制 JSON schema，但要有明确的 result 写入和读取方式。父工具结果至少应包含 `sessionId`、`status`、`result` 摘要，以及 `messagesUrl` / `resultUrl` / `traceUrl`。

4. foreground / background。

   有了结果协议后再做等待逻辑。foreground 等子代理完成并返回摘要；background 立即返回 session id 和资源 URL。

5. `finished` 生命周期。

   在 foreground/background 稳定后加入 `finish_on_result`。一次性子代理完成后归档为 `finished`，长期子代理保持 `idle` 方便 resume。

6. resume 子代理。

   resume 依赖 session 生命周期和 finished/idle 语义，建议排在 `finished` 后面做。

暂时不建议先做：

```text
AgentSwarm
schema/yield 强校验
独立 worktree
自动 patch merge
复杂 /sessions/:id/subagents HTTP API
```

原因是这些都依赖单子代理闭环稳定，否则会把错误处理、取消、结果收集、UI 展示的复杂度放大。

### Phase 1：单子代理最小闭环

目标：

```text
主代理可以创建一个子 session。
子 session 完成任务。
父代理拿到结果摘要。
UI 能看到父子 session。
```

实现内容：

- 新增 `src/subagents/types.ts`
- 新增 `src/subagents/policy.ts`
- 新增 `src/subagents/coordinator.ts`
- 新增 `src/subagents/tools.ts`
- `SessionManager` 注入 `Agent` 工具
- 使用 `members.role="spawned"` 授权
- 支持 foreground / background / resume
- 子代理默认不能继续创建子代理
- 扩展上下文增加 `isMainSession` 或 session kind
- 不增加 `/sessions/:id/subagents` API；通过现有 members 接口配置可用子代理，通过 session children 查询结果

### Phase 2：批量子代理

目标：

```text
一次开多个子代理，结果按输入顺序返回。
```

实现内容：

- `AgentSwarm` 工具
- `prompt_template + items`
- 最大并发
- 部分失败结果
- 批量 resume

### Phase 3：结构化结果和隔离写入

目标：

```text
子代理可以输出结构化结果。
写代码型子代理可以安全隔离。
```

实现内容：

- output schema
- yield result
- 子代理 patch
- 手动 merge
- 可选独立 worktree

## 第一版验收标准

- 主 session 可以调用 `Agent` 创建子 session。
- 子 session 在 `GET /sessions/:id/children` 中可见。
- 子 session 的消息只写入自己的 `messages`。
- 子代理完成后，父工具结果包含 `sessionId` 和摘要。
- 父代理可以 resume 同一个子 session。
- 子代理默认不会再创建子代理。
- 未授权的 `subagent_type` 会被拒绝。
- foreground 父调用 abort 时，子 session 被取消。
- background 子 session 不会因为父 turn 结束而丢失。
- 子代理运行时，前端可以实时看到 child session 的消息流和状态变化。
- 一次性子代理完成后可以标记为 `finished`，长期子代理可以保持 `idle` 并允许后续 resume。
