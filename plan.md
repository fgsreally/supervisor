# Supervisor 权限方案

## 目标与边界

权限是 Supervisor 的系统与界面概念，不依赖 LLM 主动判断，也不要求扩展通过抛出特定错误来决定权限。

Supervisor 只管理自己能够控制的执行入口，包括 Native Agent 工具、扩展工具、MCP、Job、Session 与资源访问。Codex、Claude 等外部 Agent 的内部工具继续由其自身权限系统管理；Supervisor 只负责转发、展示和记录外部 Agent 发出的审批请求。

## 统一权限入口

建立单一 `PermissionEngine`，所有受 Supervisor 控制的操作在真正执行前提交标准化请求：

```text
工具 / MCP / 扩展 / Job / Session 操作
                  |
                  v
          PermissionEngine
           /      |      \
        allow     ask     deny
```

标准请求至少包含：

```ts
interface PermissionRequest {
  sessionId: number;
  agentId?: number;
  parentSessionId?: number;
  source: "native" | "extension" | "mcp" | "job" | "session" | "external";
  toolName?: string;
  capability: string;
  resources: PermissionResource[];
  description?: string;
}
```

第一阶段覆盖：

- Native Agent 工具
- `ctx.tools.call()`
- MCP 工具
- 扩展注册工具
- Job 创建、输入、取消和重试
- 子 Session 创建、中断和继续
- Supervisor 自己控制的文件、进程和网络访问

## 工具能力声明

工具注册时声明它需要的能力以及如何从参数中提取资源：

```ts
permissions: {
  capabilities: ["filesystem.write", "process.execute"],
  resolveResources(args) {
    return [{ type: "path", value: args.path }];
  },
}
```

扩展只描述能力，不决定 `allow`、`ask` 或 `deny`，也不需要抛出 `ToolError`。权限结果由 `PermissionEngine` 根据规则统一判断。

第三方工具没有权限声明时默认 `ask`；高风险且无法解析目标的操作默认 `deny`。

建议的基础能力包括：

- `filesystem.read`
- `filesystem.write`
- `filesystem.delete`
- `process.execute`
- `process.signal`
- `network.connect`
- `secret.read`
- `job.manage`
- `session.spawn`
- `session.interrupt`

## 规则层级与继承

```text
Global
  └─ Project
      └─ Agent
          └─ Session
```

规则原则：

- 越具体的规则优先。
- 明确的 `deny` 不能被更低层级绕过。
- Session 临时授权只影响当前 Session。
- 子 Agent 的有效权限是自身规则与父 Session 权限的交集，不能高于父 Session。
- Plan mode 使用 Session 级临时只读覆盖层，不另建一套权限系统。

初始默认策略：

- 工作区内读取默认允许。
- 工作区内写入由 Agent 的权限配置决定。
- 工作区外写入、危险进程、敏感文件和未知能力必须询问或拒绝。
- 删除、覆盖、提交、推送等有明显副作用的动作单独声明能力。

## 持久化模型

建议增加三张表：

### `permission_rules`

保存 Global、Project、Agent 和 Session 规则：

- scope 类型与 ID
- effect：`allow` / `ask` / `deny`
- capability
- tool pattern
- resource pattern
- constraints
- expiresAt
- createdAt / updatedAt

### `permission_requests`

保存审批请求及其状态：

- 请求主体与目标资源
- `pending` / `approved` / `rejected` / `interrupted`
- 审批范围
- 创建和解决时间
- 对应 Session、Turn、toolCallId 或 Job ID

### `permission_audit_log`

保存最终决定与执行结果：

- 命中的规则
- 最终决定
- 用户选择
- 实际执行结果
- 来源 Agent、Session 和扩展

Supervisor 重启后，未完成审批统一转为 `interrupted`。旧 Promise 无法安全恢复，因此不能在重启后自动执行原操作；模型重新尝试该操作时再次发起审批。

## 审批 UI

审批卡片需要明确显示：

- 发起者：Agent、Session、扩展或外部 Agent
- 准备执行的动作
- 目标文件、命令、域名、Job 或 Session
- 风险说明
- 命中的现有规则

用户操作：

- 允许一次
- 本 Session 允许
- 本 Project 允许
- 拒绝

`revise` 只用于 Plan 审阅，不用于普通权限审批。

权限设置页面用于查看、编辑和删除长期规则，并提供审批与执行审计记录。

## 外部 Agent

Supervisor 不拦截外部 Agent 内部无法观察的工具调用。对于外部 Agent 原生提供的审批协议：

- 转换为统一审批 UI。
- 保存请求与用户决定。
- 将决定原样返回外部 Agent。
- 在审计记录中标明决定由外部 Agent 执行。

不能因为 UI 统一，就声称外部 Agent 已受 Supervisor 的完整权限沙箱约束。

## 实施顺序

1. 建立权限请求、规则、审计类型和数据库表。
2. 实现 `PermissionEngine` evaluator，先以只记录模式接入，不改变现有行为。
3. 为内置工具与 Job 增加能力声明和资源解析。
4. 接入 Native 工具、`ctx.tools.call()`、扩展工具和 MCP。
5. 实现持久化审批卡片和权限设置页面。
6. 实现 Global / Project / Agent / Session 继承及子 Agent 权限上限。
7. 将 Plan mode 的只读状态接入 Session 权限覆盖层。
8. 接入外部 Agent 的审批桥接与统一审计。

## 验收条件

- 所有 Supervisor 可控的副作用入口都经过同一 evaluator。
- 扩展无法通过动态调用绕过权限检查。
- 子 Agent 无法获得高于父 Session 的权限。
- Supervisor 重启不会静默丢失待审批记录。
- UI 能说明一次操作为什么被允许、询问或拒绝。
- 外部 Agent 的权限边界被准确展示，不产生虚假的安全保证。
