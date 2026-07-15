# Supervisor 子代理系统设计

本文只设计 `supervisor` 的子代理系统。目标是参考 `oh-my-pi` 的 `task` 子代理和 `kimi-code` 的 `Agent` / `AgentSwarm` 机制，同时保持 `supervisor` 现有 SQLite session、父子关系、HTTP API、extension runtime 不冲突。

## 结论

子代理在 `supervisor` 中应当继续建模为 `sessions` 表中的子 session，而不是引入另一套 agent-host 运行时。

- `sessions.parent_id` 表达父子关系。
- `sessions.branch_type = "spawn"` 表达由父 session 委派产生。
- `sessions.agent_id` 绑定实际执行的 Agent 定义。
- 子代理上下文、消息、工具调用仍写入该子 session 自己的 `messages`。
- 父代理只通过工具结果、事件和显式 resume 接收子代理摘要，不共享完整上下文。

这样能复用现有 `SessionManager.spawn()`、`GET /sessions/:id/children`、`GET /sessions/:id/tree`、`POST /sessions/:id/prompt`、`POST /sessions/:id/abort`，避免和当前 session 生命周期冲突。

## 参考仓库取舍

### oh-my-pi

可借鉴：

- `task` 工具输入分为单任务和批量任务。
- 子代理有 `assignment`、`description`、`role`、`agent`。
- 子代理输出应有结构化详情，包括状态、摘要、token/耗时、错误、是否截断。
- 支持递归深度、最大并发、超时、结果长度上限。
- 子代理可以同步等待，也可以作为后台任务运行。

不照搬：

- 不把子代理作为父进程内部的临时 agent registry。
- 不复刻 `yield` 工具作为第一期必需能力；第一期用最后 assistant 文本作为结果摘要。
- 不在第一期实现独立 worktree/patch merge。`supervisor` 已有根 session worktree 策略，子 session 先继承父 `cwd`。

### kimi-code

可借鉴：

- 单个子代理工具形态：`prompt`、`description`、`subagent_type`、`resume`、`run_in_background`。
- 批量子代理形态：共享 `description` / `prompt_template` / `items`，每个 item 对应一个子 session。
- resume 必须校验目标确实是当前父 session 的子代理。
- foreground 子代理随父 turn abort 取消；background 子代理可以继续运行。
- 子代理结果过短时可以追加一次“补充总结”的 follow-up。

不照搬：

- 不引入 `SessionSubagentHost` 的内存 agent 树。
- 不把多个 agent 放在同一个 session record 里；`supervisor` 已经有 session 树，应坚持一子代理一 session。
- 不在第一期实现 parked/revive 的独立内存机制；恢复使用现有 `SessionManager.restoreRuntime()` 路径。

## 核心概念

### Agent 定义

`agents` 表仍表示可复用模板：名称、描述、provider/model、tools preset、home dir、资源目录、系统提示。

建议把可被父代理调用的子代理能力放到 `agents.meta.subagent`：

```json
{
  "subagent": {
    "type": "coder",
    "displayName": "Coder",
    "defaultDescription": "Implement focused coding tasks",
    "maxRuntimeMs": 1800000,
    "resultMinChars": 200
  }
}
```

### 父 session 成员

现有 `members` 表应成为子代理授权表：

- `role = "primary"`：父 session 的主 agent，可选。
- `role = "spawned"`：允许被 `spawn_agent` / `Agent` 工具调用。
- `tags`：能力标签，例如 `coder`、`review`、`explore`、`readonly`。

父代理只能 spawn 自己 session 的 `members.role = "spawned"`。这比允许任意 `agent_id` 更安全，也能和 UI 上的团队配置对齐。

### 子 session meta

子 session 的 `meta.subagent` 保存委派关系和运行配置：

```json
{
  "subagent": {
    "parentSessionId": 12,
    "parentToolCallId": "toolu_...",
    "description": "Review API routes",
    "subagentType": "review",
    "mode": "foreground",
    "status": "running",
    "startedAt": 1760000000000,
    "completedAt": null,
    "resultSummary": null,
    "usage": null,
    "error": null
  }
}
```

`sessions.status` 继续表达 runtime 状态；`meta.subagent.status` 表达子代理任务语义。两者不要互相替代。

## 工具设计

第一期提供一个内建工具，名字建议使用 `Agent`，同时保留现有 `spawn_agent` provider API 的兼容能力。

### Agent 工具

参数：

```ts
{
  prompt: string;
  description: string;
  subagent_type?: string;
  agentId?: number;
  resume?: number;
  run_in_background?: boolean;
}
```

解析规则：

1. 如果传 `resume`，只能 resume 当前 session 的直接子 session，且该子 session `branch_type = "spawn"`。
2. 如果传 `agentId`，必须存在于当前 session 的 `members.role = "spawned"`。
3. 如果只传 `subagent_type`，从当前 session 的 spawned members 中按 tag 或 `agents.meta.subagent.type` 解析。
4. 如果都不传，使用第一个 spawned member，或返回清晰错误。
5. foreground 默认等待子 session 完成并返回摘要。
6. background 立即返回 `{ sessionId, status, description }`，父代理可之后调用 `resume` 或读取 children。

工具返回：

```json
{
  "sessionId": 34,
  "agentId": 7,
  "description": "Review API routes",
  "status": "completed",
  "result": "Summary...",
  "usage": { "input": 1000, "output": 500 },
  "durationMs": 42000
}
```

### AgentSwarm 工具

第二期再实现。它只是 `Agent` 的批量调度器，不应新增数据模型。

参数：

```ts
{
  description: string;
  subagent_type?: string;
  prompt_template?: string;
  items?: string[];
  resume_session_ids?: Record<string, string>;
  max_concurrency?: number;
}
```

返回按输入顺序排列的结果数组。失败、取消、未启动都占用自己的结果槽位。

## 运行语义

### foreground

foreground 子代理是父 turn 的阻塞工具调用：

1. 父代理调用 `Agent`。
2. `SubagentCoordinator` 创建子 session。
3. 子 session 立即执行 `instructions = prompt`。
4. 工具等待 `agent_end`、`error`、`abort` 或 timeout。
5. 提取子 session 最后一条 assistant 文本。
6. 若摘要长度低于阈值，可追加一次 follow-up 要求补充。
7. 工具结果返回父代理。

父 turn 被 abort 时，foreground 子 session 应一并 abort。

### background

background 子代理是独立任务：

1. 父代理调用 `Agent(run_in_background: true)`。
2. 创建并启动子 session。
3. 工具立即返回 session id。
4. 子 session 继续运行，状态通过 `/sessions/:id/events` 或树视图观察。
5. 父代理后续可用 `Agent(resume: childSessionId, prompt: "...")` 继续该子代理。

父 turn abort 不取消 background 子 session，除非显式调用 kill/abort。

### resume

resume 不创建新 session，只向已有子 session prompt：

- 目标必须是当前 session 的直接子 session。
- 目标不能处于 `running` 或 `waiting_user`。
- resume 的 prompt 追加到子 session 自己的上下文。
- 返回值和 foreground/background 规则一致。

## 调度与保护

第一期建议实现这些硬约束：

- `maxDepth`：默认 1。子代理默认不能再 spawn 子代理，除非 agent/meta 显式开启。
- `maxConcurrentChildren`：默认 4，按父 session 计数。
- `timeoutMs`：默认 30 分钟。
- `maxResultChars`：默认 20000，工具结果超出则截断，但完整消息仍保留在子 session。
- `allowedToolsPreset`：子代理默认继承自己的 agent `toolsPreset`，不要继承父 session 的临时 override tools。
- `allowBackground`：默认 true，可由 agent/meta 或 server settings 禁用。

第二期可加：

- rate limit 感知的重试队列。
- `AgentSwarm` 渐进启动与并发恢复。
- 子代理结果 schema / yield。
- 子代理隔离 worktree 与 patch merge。

## API 补充

第一期不新增 `/sessions/:id/subagents` 这类语义端点。

原因：

```text
子代理就是普通 child session。
可调用哪些子代理由现有 members 接口配置。
子代理列表可由现有 children/tree/session API 查询。
新增 /subagents API 会和 members/session 两套入口重复。
```

第一期继续复用：

```text
members API:
  配置当前 session 可调用哪些 spawned member agent。

session spawn / prompt / abort / children API:
  创建、运行、取消和查看子代理 session。

extension tool:
  提供 LLM 友好的 spawn_agent / Agent 工具参数。
```

如果未来确实需要 `/subagents`，也只能作为组合视图或便捷包装，不能成为独立生命周期入口。

## 内部模块划分

建议新增：

- `src/subagents/types.ts`：工具输入、结果、meta 类型。
- `src/subagents/policy.ts`：成员授权、type/tag 解析、depth/concurrency 校验。
- `src/subagents/coordinator.ts`：spawn/resume/wait/abort/summary。
- `src/subagents/tools.ts`：创建 `Agent` / `AgentSwarm` 工具。

调整：

- `SessionManager.assembleSessionTools()`：根据 session 是否有 spawned members 注入 `Agent` 工具。
- `SessionManager.spawn()`：写入 `meta.subagent`，并为 child 设置 `branchType = "spawn"`。
- `SessionManager.abort()`：可选地取消 foreground children。
- `http-server.ts`：补充 `/subagents` 语义 API。

清理：

- `src/extensions/spawn-agent-tool.ts` 与新设计重叠且注释编码损坏。实现第一期时应删除或迁移其有效逻辑，避免两个同名工具并存。

## 与当前 supervisor 的兼容边界

- 不改 `messages.parent_id` 语义；它仍是 session 内 entry 链，不是 session 树。
- 不把父 session 的历史复制到子 session；spawn 是新任务上下文，fork/clone 才复制历史。
- 不改变根 session git worktree 生命周期；子代理默认共享父 `cwd`。
- 子代理工具由 supervisor 的内置扩展统一提供，不开放额外的 spawn provider 注册入口。
- 不要求 UI 立即支持复杂 swarm；第一期只需要 children/tree 能看见子 session。

## 分阶段实现

### Phase 1：单子代理

1. 增加 `SubagentCoordinator`。
2. 用 `members.role = "spawned"` 做授权。
3. 注入 `Agent` 工具，支持 foreground/background/resume。
4. 复用 members/session API，不新增 `/sessions/:id/subagents`。
5. 为 spawn/resume/abort/permission 写 vitest。

### Phase 2：批量子代理

1. 增加 `AgentSwarm`。
2. 增加父 session 级并发控制。
3. 结果按输入顺序返回。
4. 支持部分失败和用户取消。

### Phase 3：结构化结果与隔离

1. 支持 `agents.meta.subagent.outputSchema`。
2. 增加 `yield_result` 或等价结果提交工具。
3. 支持 isolated worktree 子代理和 patch/branch merge。

## 验收标准

- 父代理只能调用已授权 spawned member。
- foreground 子代理完成后，父工具结果包含可读摘要和 child session id。
- background 子代理返回后仍可在 `/sessions/:id/children` 看到，并能独立完成。
- resume 只能作用于当前父 session 的子 session。
- abort 父 foreground 工具调用时，子 session 被取消或标记失败。
- `GET /sessions/:id/tree` 同时显示 fork/clone/spawn，但能通过 `branch_type` 区分。
