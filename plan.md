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

---

文件
读取项目文件 始终允许
修改项目文件 始终允许
访问项目外文件 每次询问
删除文件 每次询问

命令
执行项目脚本 始终允许
安装依赖 每次询问
执行系统命令 每次询问

网络
调用 Supervisor 本地接口 始终允许
访问其他网络地址 每次询问

Supervisor 管理
查询配置和运行状态 始终允许
修改 Agent、扩展和资源 始终允许
修改全局设置 每次询问

内部再映射成 capability：

“修改项目文件”
→ filesystem.write
→ resource 必须位于 project.cwd

“调用 Supervisor 本地接口”  
→ network.connect  
→ host 必须是当前 Supervisor 实例

用户不必理解这些内部名称。

### 默认预设

可以提供三个预设：

模式 行为  
━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
受限 读取允许，写入、命令和网络基本都询问  
────────── ───────────────────────────────────────────────────  
标准 项目内修改允许，项目外操作和危险命令询问  
────────── ───────────────────────────────────────────────────  
完全信任 Supervisor 可控制范围内基本允许，只拦截明确禁止项

Pi 助手作为内置管理助手，还可以有一个专用预设：

Supervisor 管理助手

允许：

- 查询 Supervisor 环境
- 调用 Supervisor HTTP API
- 调用 Supervisor CLI
- 读写 Supervisor 数据库
- 管理 Agent、资源和扩展

询问：

- 删除大量数据
- 访问 Supervisor 之外的数据库
- 操作其他项目
- 向公网发送数据

这样用户无需逐项配置，也不会妨碍 Pi 助手直接管理系统。

———

## 运行过程中如何设置权限

权限主要不应靠用户提前填表，而应在第一次遇到操作时生成。

例如 Pi 助手准备安装扩展：

Pi 助手准备安装扩展

扩展：  
@company/my-extension

将执行：  
pnpm add @company/my-extension

影响：

- 访问 npm registry
- 修改扩展安装目录
- 可能执行依赖安装脚本

○ 仅允许这一次  
○ 本 Session 内允许安装扩展  
○ 始终允许 Pi 助手安装 npm 扩展

[拒绝] [允许]

如果用户选择：

始终允许 Pi 助手安装 npm 扩展

系统自动生成一条规则：

Agent：Pi 助手  
操作：安装 npm 扩展  
范围：Supervisor 扩展目录  
决定：允许

之后可以在权限页看到和删除：

自定义规则

Pi 助手可以安装 npm 扩展 [删除]  
Pi 助手访问公网时需要询问 [删除]  
任何 Agent 都不能读取 ~/.ssh [删除]

这比要求用户预先理解权限模型容易很多。

———

## 为什么要追踪完整调用链

链路不是最终目的。它解决三个问题：

1. 知道是谁发起的。
2. 防止扩展借其他工具绕过限制。
3. 允许用户配置精确规则。

例如最终执行的都是数据库写入：

链路 A：  
Pi 助手  
→ supervisor-admin  
→ database.update  
→ agents 表

链路 B：  
普通 Agent  
→ 第三方扩展 unknown-helper  
→ database.update  
→ agents 表

如果只看最后一步，两者完全一样：

database.update agents

但用户可能希望：

允许 Pi 助手通过内置 supervisor-admin 修改 agents 表  
拒绝第三方扩展修改 agents 表

因此权限判断需要同时知道：

{  
"actor": "Pi 助手",  
"extension": "supervisor-admin",  
"action": "database.update",  
"resource": {  
"database": "Supervisor",  
"table": "agents"  
}  
}

链路记录完成后，权限引擎用它匹配用户规则，然后得出：

allow / ask / deny

———

## 数据库操作的完整例子

用户对 Pi 助手说：

> 把所有未启用的扩展启用。

Pi 助手先通过管理工具查询：

Pi 助手
→ supervisor_admin  
→ database.query  
→ agent_resources 表

查询属于只读，并且 Pi 助手默认具有 Supervisor 查询权限：

决定：允许

然后准备更新：

Pi 助手  
→ supervisor_admin  
→ database.update  
→ agent_resources 表  
→ 条件：enabled = false

权限引擎得到：

{  
"agent": "Pi 助手",  
"source": "builtin-extension:supervisor-admin",  
"action": "更新 Agent 扩展状态",  
"resource": {  
"database": "Supervisor",  
"table": "agent_resources"  
}  
}

如果使用“Supervisor 管理助手”预设：

决定：允许

如果准备执行的是：

DELETE FROM agents

则动作被识别为批量删除：

决定：询问

界面显示：

Pi 助手准备删除 12 个 Agent

这会同时影响相关 Session 和资源绑定。

[拒绝] [允许一次]

———

## HTTP 调用的例子

用户说：

> 帮我新建一个 Agent。

Pi 助手发现可以调用 Supervisor HTTP API：

Pi 助手  
→ supervisor_admin  
→ HTTP POST /agents  
→ 当前 Supervisor 实例

规则是：

Pi 助手调用当前 Supervisor 的管理接口：允许

所以不会询问。

但如果某个扩展要调用：

POST https://unknown.example/upload

系统识别为公网请求：

某扩展准备向 unknown.example 发送数据

来源：  
Pi 助手 → third-party-extension → HTTP

[拒绝] [允许一次] [始终允许该域名]

这里不能依赖硬编码的 127.0.0.1:3030。资源应该是：

Supervisor 当前实际监听地址

由运行时环境发现工具提供。

———

## CLI 调用的例子

用户说：

> 重启 Supervisor。

调用链：

Pi 助手  
→ supervisor_admin  
→ supervisor CLI  
→ service restart

界面内部规则：

查询 CLI 帮助：允许  
查看状态：允许  
启动/停止/重启服务：询问或按预设允许

这比简单判断“能否执行 shell”更准确。因为：

supervisor status

和：

Remove-Item -Recurse C:\

虽然都是执行进程，风险完全不同。

———

## 子 Agent 的例子

主 Session 权限是：

项目内写入：允许  
项目外写入：拒绝  
公网访问：询问

它创建一个子 Agent，并要求：

项目内写入：允许  
项目外写入：允许  
公网访问：允许

最终权限取交集：

项目内写入：允许  
项目外写入：仍然拒绝  
公网访问：仍然询问

子 Agent 不能通过自己的配置扩大父 Session 权限。

———

## shadow/audit-only 是什么

这个名称确实容易和 Shadow Agent 混淆。更合适的中文名称是：

> 权限观察模式

它和 Shadow Agent 没有任何关系。

权限系统上线初期，我们还不知道规则是否准确。如果一开始就真正拦截，可能出现：

用户让 Pi 助手创建 Agent  
→ 权限引擎错误识别成危险数据库操作  
→ 每一步都弹窗  
→ Pi 助手无法正常工作

所以第一阶段只观察：

操作照常执行  
权限引擎在后台计算“如果启用权限，本次会如何处理”  
把结果写入开发审计日志  
不向用户弹窗  
不阻止操作

例如后台记录：

实际行为：已执行  
预测决定：ask  
原因：写入 Supervisor 数据库  
来源：Pi 助手 → supervisor-admin → database.update

运行一段时间后发现，Pi 助手正常管理 Supervisor 会产生大量询问，就可以补充默认规则：

内置 Pi 助手

- 内置 supervisor-admin
- Supervisor 自身数据库  
  = allow

另一个记录：

实际行为：已执行  
预测决定：deny  
原因：第三方扩展尝试读取 ~/.ssh/id_rsa

这说明识别是合理的。

确认误判率可以接受后，再开启真正拦截。

因此观察模式只是开发和迁移手段，不需要作为普通用户设置出现在界面里。为了避免混淆，我建议在文档和代码中叫：

enforcementMode: "observe" | "enforce"

而不要再叫 shadow mode。

整体上，我设想的产品体验是：

普通用户  
→ 选择“标准”权限预设  
→ 第一次敏感操作时作出选择  
→ 系统自动形成长期规则

高级用户  
→ 在 Global / Project / Agent 权限页精细调整

开发阶段  
→ 使用 observe 模式检查误判  
→ 稳定后切换 enforce

这才是追踪完整链路之后真正要实现的东西。

### 1. 当前状态和“完全信任”一样吗？

不完全一样。更准确地说，当前是：

> 默认可执行，少数入口各自审批，没有统一权限边界。

目前存在一些零散限制：

- 部分编辑工具有审批
- 扩展可以主动调用 requestApproval
- Codex、Claude 等外部 Agent 有自己的审批机制
- Agent 可以禁用某些工具和扩展
- 操作仍受 Supervisor 进程自身的操作系统权限限制

但当前没有统一机制保证：

文件、HTTP、数据库、CLI、MCP、Job  
全部经过同一个权限判断

所以当前既不是正式的“完全信任”，也不是可靠的“标准模式”，而是：

大部分默认允许 + 若干局部审批

“完全信任”应该是权限引擎建立后的一种明确配置，而且即使完全信任，也不能突破：

- 操作系统权限
- Supervisor 自身的硬安全限制
- 父 Session 权限上限
- 外部 Agent 自己的沙箱
- 明确的全局禁止规则

———

### 2. 系统自动生成规则，由谁生成？

不由 LLM 生成。

既不是华生，也不是 Shadow Agent。

规则由后端根据用户点击的固定选项，确定性生成。例如审批请求已经包含：

{  
"agentId": 10,  
"action": "extension.install",  
"resource": {  
"registry": "npm",  
"package": "@company/foo"  
}  
}

用户点击：

始终允许 Pi 助手安装这个扩展

后端用固定代码转换成：

{  
"scope": {  
"type": "agent",  
"id": 10  
},  
"effect": "allow",  
"capability": "extension.install",
"resource": {  
"registry": "npm",  
"package": "@company/foo"  
}  
}

不存在“让模型理解用户意思后自由生成规则”的环节。

整个过程是：

工具提供标准权限请求  
→ 后端生成固定审批选项  
→ 用户点击某个选项  
→ 后端按照固定模板创建规则

LLM 最多负责向用户解释为什么需要该权限，但不能决定是否授权、授权范围或修改规则。

———

### 3. 同意安装一个 npm 包，后续全部同意吗？

不会，除非用户明确选择“允许所有 npm 包”。

审批界面应该把范围讲清楚：

Pi 助手准备安装 @company/foo

○ 仅允许本次安装  
○ 本 Session 内允许安装 @company/foo  
○ 始终允许 Pi 助手安装 @company/foo  
○ 始终允许 Pi 助手从 npm 安装任意扩展

对应行为：

用户选择 后续安装同一个包 后续安装其他包  
━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━  
仅允许一次 重新询问 重新询问  
───────────────────── ─────────────────── ────────────────  
本 Session 允许该包 当前 Session 允许 重新询问  
───────────────────── ─────────────────── ────────────────  
始终允许该包 允许 重新询问  
───────────────────── ─────────────────── ────────────────  
允许任意 npm 扩展 允许 允许

我建议默认只展示前三项。

“允许任意 npm 扩展”属于较宽授权，可以放在“更多选项”里，并显示风险说明，因为 npm 包可能包含安装脚本。

还需要注意版本：

@company/foo@1.2.0

授权范围可以是：

- 只允许这个确切版本
- 允许这个包的任意版本
- 允许某个组织，如 @company/*
- 允许整个 npm registry

这些范围必须由用户明确选择，不能从“允许一个包”自动扩大成“允许所有包”。

———

### 4. Pi 助手更新数据库为什么默认允许？

我说的不是：

> Pi 助手执行任意 SQL 都默认允许。

默认允许的应该是一个非常窄的组合：

内置 Pi 助手

- 内置 supervisor-admin 扩展
- Supervisor 自己的数据库
- 已声明的结构化管理操作

例如：

set_extension_enabled({  
agentId: 10,  
extensionId: 6,  
enabled: true  
})

这个工具只能修改特定表中的特定字段，因此可以映射成：

操作：设置扩展启用状态  
范围：当前 Supervisor  
影响：一个 Agent 的一个扩展

这类操作默认允许，是因为 Pi 助手本来的产品职责就是管理 Supervisor。如果每次启用扩展、修改 Agent 名称都弹审批，用户仍然需要学习底层管理过程，违背了 Pi 助手的目标。

但下面这些不应默认允许：

DELETE FROM agents;  
DROP TABLE sessions;  
UPDATE agents SET ...;  
ATTACH DATABASE '其他数据库';  
SELECT * FROM credentials;

推荐规则如下：

操作 Pi 助手默认行为  
━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━  
查询 Supervisor 状态 允许  
─────────────────────────── ─────────────────  
查询 Agent、扩展和资源 允许  
─────────────────────────── ─────────────────  
修改一个 Agent 的普通配置 允许  
─────────────────────────── ─────────────────  
启用/停用一个扩展 允许  
─────────────────────────── ─────────────────  
创建 Agent、绑定资源 允许  
─────────────────────────── ─────────────────  
删除一个普通资源 询问  
─────────────────────────── ─────────────────  
批量删除、覆盖 询问  
─────────────────────────── ─────────────────  
读取密钥明文 询问或拒绝  
─────────────────────────── ─────────────────  
执行任意原始 SQL 询问  
─────────────────────────── ─────────────────  
操作其他数据库 询问或拒绝  
─────────────────────────── ─────────────────  
修改数据库结构 询问或拒绝

核心区别是：

结构化管理工具：可以精确判断影响范围  
原始 SQL：很难可靠判断副作用

因此我更推荐 Pi 助手优先使用：

结构化 HTTP API / CLI / 管理工具

数据库作为缺少上层接口时的兜底方式。即使允许直接操作数据库，也应优先提供结构化数据库工具：

supervisor_db_update({  
table: "agent_resources",  
where: { agent_id: 10, resource_id: 6 },  
values: { enabled: 1 }  
});

而不是给它一个完全不受限的：

execute_sql("任意 SQL");

如果你认为即便是 Pi 助手的普通配置更新也应该先询问，可以把默认预设调整成：

读取默认允许  
所有写操作默认询问

但这会明显增加使用过程中的审批频率。我的推荐是“普通可恢复 CRUD 默认允许，破坏性和越界操作询问”。

———

### 5. audit-only 是华生或 Shadow Agent 吗？

都不是。

audit-only 是普通后端代码，不使用任何 LLM。

为了避免和 Shadow Agent 混淆，我建议正式命名为：

observe mode / 观察模式

实现大致是：

const request = normalizePermissionRequest(toolCall);  
const decision = permissionEngine.evaluate(request);

await auditLog.record({  
request,  
predictedDecision: decision,  
enforced: false  
});

// 观察模式不拦截  
return executeTool();

例如扩展准备写项目外文件，规则引擎根据固定代码判断：

目标路径：C:\Windows\system32\config  
项目路径：D:\my-project\supervisor-standalone

目标不在项目目录内  
→ 预测结果：ask

它不需要模型理解路径。

另一个例子：

工具：supervisor_extension_enable  
调用者：Pi 助手  
来源：内置 supervisor-admin  
目标：当前 Supervisor 的 extension 6  
规则：内置管理助手可以修改普通扩展状态

→ 预测结果：allow

再一个例子：

工具：bash  
命令：任意字符串  
调用者：第三方扩展  
目标资源：无法可靠解析  
规则：未知高风险进程执行需要询问

→ 预测结果：ask

观察模式只会记录：

{  
"predictedDecision": "ask",  
"actualBehavior": "executed",  
"enforced": false  
}

正式启用权限后，同一个结果才会真正弹出审批：

if (decision.effect === "ask") {  
return approvalService.waitForUser(request);  
}

权限安全不能依赖华生或 Shadow 判断，原因是 LLM：

- 相同输入可能得到不同答案
- 可能被工具参数中的文本诱导
- 无法作为可靠的安全边界
- 难以解释一条规则为什么命中
- 不适合做严格、可测试的授权判断

所以职责应严格区分：

PermissionEngine  
→ 固定代码，负责安全决策

华生  
→ 执行内部辅助任务，不参与授权

Shadow Agent  
→ 观察主会话、维护记忆和建议，不参与授权

用户  
→ 对需要询问的操作作最终决定

一句话总结：

> 权限规则由程序匹配，授权范围由用户选择，LLM 既不生成规则，也不批准操作。

## 1. 标准模式与完全信任

调整后的定义应该是：

情况 标准模式 完全信任  
━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━  
结构化只读工具 允许 允许  
─────────────────────── ────────────────────────────── ──────────  
结构化普通写操作 按工具声明处理，通常允许 允许  
─────────────────────── ────────────────────────────── ──────────  
结构化危险操作 询问 允许  
─────────────────────── ────────────────────────────── ──────────  
原始 bash 询问，且通常只允许一次 允许  
─────────────────────── ────────────────────────────── ──────────  
原始 SQL 写入 询问，且不生成长期细粒度规则 允许  
─────────────────────── ────────────────────────────── ──────────  
已声明的 HTTP 操作 按路由权限声明处理 允许  
─────────────────────── ────────────────────────────── ──────────  
无法识别的 fetch/HTTP 询问 允许  
─────────────────────── ────────────────────────────── ──────────
明确硬禁止项 拒绝 仍然拒绝

所以区别不是“标准模式更聪明地理解 bash”，而是：

> 标准模式只自动信任系统能够结构化理解的操作；完全信任允许不透明操作直接执行。

例如：

supervisor_extension_enable({ agentId: 10, extensionId: 6 })

系统知道这是“启用扩展”。

而：

bun run foo.ts --whatever

系统不知道脚本内部会做什么。标准模式不能假装知道，只能询问；完全信任才直接执行。

———

## 2. 当前非外部 Agent 什么时候审批

目前实际情况很有限：

1. Pi 助手的 supervisor_http
   - DELETE 请求会审批。
   - URL 包含 uninstall、kill、complete 时会审批。
   - 普通 POST、PATCH、PUT 默认不审批。

2. Pi 助手的 supervisor_db_write
   - 所有 INSERT、UPDATE、DELETE 都审批。

3. edit 工具
   - 只有调用时显式传入 requireApproval: true 才审批。
   - 也就是说是否审批部分依赖调用者选择，并不是统一策略。

4. ExitPlanMode
   - 展示计划并要求用户批准、修改或拒绝。

5. 扩展主动调用 ctx.ui.requestApproval()
   - 完全依赖扩展作者主动调用。

除此之外，目前没有统一的 bash、fetch、MCP、Job 权限判断。

现有 supervisor_http 用 HTTP 方法和路径关键字猜风险，正是你指出的问题。例如：

POST /agents/10/delete-everything

如果路径没有命中当前正则，就可能被当成普通写操作。因此当前实现只能算临时保护，不应成为正式权限模型。

———

## 3. 不应该解析 bash 来生成规则

下面这些命令都可能是 npm 安装：

npm install foo  
npm i foo  
pnpm add foo  
bun add foo  
cmd /c npm install foo  
powershell -Command "npm install foo"  
node custom-installer.js foo

而且安装脚本内部还可以执行任意代码。

所以不应该试图维护一套“命令语义识别器”。这会变成永远补不完的黑名单和解析器。

正确做法是区分两类工具。

### 结构化工具

extension_install({  
source: "npm",  
package: "@company/foo",  
});

系统准确知道：

- 操作是安装扩展
- 来源是 npm
- 包名是 @company/foo
- 安装目录在哪里
- 是否允许安装脚本

这时可以生成可靠规则。

### 不透明工具

bash({  
command: "npm install @company/foo",  
});

系统只知道：

- 要启动 shell
- 命令字符串是什么
- cwd 是什么

它不知道执行后的真实副作用。因此标准模式只应该显示：

Pi 助手准备执行一个不透明命令

npm install @company/foo

系统无法确认该命令的全部副作用。

[拒绝] [允许一次]

可以再提供一个较宽的高级选项：

[本 Session 信任 bash]

但不能自动生成：

始终允许安装 @company/foo

因为系统实际上没有可靠识别出这是结构化的“安装扩展”。

结论是：

> 希望获得顺畅、可记忆的权限体验，就必须使用结构化工具；原始 bash 不可能同时做到通用、精确和安全。

———

## 4. 不需要给每种命令设计大量选项

我前面给 npm 展示四个选项，确实过度设计了。

实际审批卡片只保留：

[拒绝] [允许一次]

□ 记住我的选择

只有操作提供了可靠的“可记忆范围”时，才显示复选框。

例如结构化扩展安装工具声明：

permission: {  
action: "extension.install",  
resource: ({ packageName }) => ({  
type: "npm-package",  
id: packageName,  
}),  
rememberScopes: ["agent", "project"],  
}

系统可以展示：

□ 对 Pi 助手安装 @company/foo 记住此选择

而 bash 没有可靠资源声明：

permission: {  
action: "process.execute",
rememberScopes: [],  
}

则只展示：

[拒绝] [允许一次]

因此不是每条命令都设计不同按钮，而是：

- 固定按钮：拒绝、允许一次。
- 工具能提供可靠范围时，额外允许记住。
- 工具无法描述副作用时，不允许形成细粒度长期规则。

———

## 5. fetch 怎么区分删除和更新

不能根据 fetch 本身判断。

下面两个请求即使都是 POST，语义可能完全不同：

POST /extensions/6/enable  
POST /extensions/6/uninstall

权限信息必须和 HTTP 路由定义放在一起：

defineRoute({  
method: "POST",  
path: "/extensions/:id/enable",

    permission: {
      action: "extension.enable",
      risk: "normal-write",
      resource: ({ params }) => ({
        type: "extension",
        id: params.id,
      }),
    },

    handler: enableExtension,

});

删除接口即使也是 POST：

defineRoute({  
method: "POST",  
path: "/extensions/:id/uninstall",

    permission: {
      action: "extension.uninstall",
      risk: "destructive",
      resource: ({ params }) => ({
        type: "extension",
        id: params.id,
      }),
    },

    handler: uninstallExtension,

});

权限不是写在另一份硬编码列表里，而是和 Elysia 路由一起定义。这样修改路由时不会忘记同步权限信息。

OpenAPI 也可以从同一个定义生成：

{  
"operationId": "extension.enable",  
"x-supervisor-permission": {  
"action": "extension.enable",  
"risk": "normal-write"  
}  
}

Pi 助手通过 supervisor_http 发出请求时，系统先在路由注册表中匹配：

POST /extensions/6/enable  
→ extension.enable  
→ 普通写操作

而不是看到 POST 就猜。

### 仅在工具侧检查还不够

如果 Pi 助手还拥有 bash，它可以绕过 supervisor_http：

curl -X POST http://127.0.0.1:3030/extensions/6/uninstall

因此真正可靠的实现必须在 HTTP 服务端再次检查：

Agent 调用 Supervisor HTTP  
→ 携带 Agent/Session 身份令牌  
→ Elysia 路由读取权限声明  
→ 服务端执行 PermissionEngine  
→ 允许后才进入 handler

没有 Agent 身份令牌的写请求应拒绝，或者被视为未知调用者。

否则链路追踪只是记录，无法阻止绕过。

———

## 6. Pi 助手通过 fetch 启用与删除扩展

假设 Pi 助手调用：

supervisor_http({  
method: "POST",  
path: "/agents/10/extensions/6/enable"  
})

路由声明是：

action: extension.enable  
risk: normal-write

标准模式中的 Pi 助手预设可以是：

内置 Pi 助手

- 当前 Supervisor
- extension.enable  
  = allow

所以直接执行。

如果调用：

supervisor_http({  
method: "POST",  
path: "/agents/10/extensions/6/uninstall"  
})

路由声明是：

action: extension.uninstall  
risk: destructive

即使同样是 POST 和 fetch，也会询问：

Pi 助手准备卸载扩展 foo

该操作会删除扩展安装内容并解除绑定。

[拒绝] [允许一次]

决定来自路由定义，不来自 LLM，也不来自对 URL 文本的猜测。

———

## 7. 数据库也是同样的问题

原始 SQL：

UPDATE agent_resources SET enabled = 1;

虽然能解析出是 UPDATE，但仍然有很多问题：

- 会更新几行？
- 是否缺少 WHERE？
- 是否触发 trigger？
- 是否破坏业务约束？
- 是否应该同步其他状态？

所以：

### 结构化数据库操作

setAgentExtensionEnabled({  
agentId: 10,  
extensionId: 6,  
enabled: true,  
});

系统知道它是一个普通、有限、可恢复的操作，可以默认允许 Pi 助手执行。

### 原始数据库写入

supervisor_db_write({  
sql: "UPDATE ...",  
});

标准模式始终询问，不尝试生成“以后允许类似 SQL”的规则。

完全信任模式才直接运行原始 SQL。

更理想的方案是 Pi 助手根本不需要经常写原始 SQL：缺少哪个管理能力，就补哪个结构化服务操作。原始 SQL只作为兜底。

———

## 8. 完整调用链到底还有什么用

它不负责理解操作，而是负责确认调用主体。

操作语义来自：

结构化工具声明  
Elysia 路由声明  
CLI 命令声明

调用链负责区分：

Pi 助手 → 内置 supervisor-admin → extension.enable

和：

普通 Agent → 第三方扩展 → extension.enable

同一个结构化操作可以有不同规则：

Pi 助手调用 extension.enable：允许  
第三方扩展调用 extension.enable：询问  
未知 Agent 调用 extension.enable：拒绝

所以完整判断是：

调用链：谁在调用  
操作声明：准备做什么  
资源解析：准备影响谁  
规则：这个调用者能否对这个资源执行这个操作

缺一不可。

———

## 9. 观察模式解决不了分类问题

你说得对，观察模式不能自动解决 bash/fetch 的语义，也不会“记住并学会规则”。

它只用于发现接入缺口，例如记录：

未知操作：  
Pi 助手 → bash → npm install foo

原因：  
bash 没有结构化操作声明

然后开发者决定：

这是常见需求  
→ 增加 extension_install 结构化工具

另一个记录：

已识别：  
Pi 助手 → supervisor_http  
→ Elysia route extension.enable  
→ resource extension:6

表示这条链路已经可以安全制定规则。

因此观察模式的作用只是回答：

- 哪些操作已经可以可靠识别？
- 哪些仍然是不透明操作？
- 有没有绕过统一入口？
- 默认策略会产生多少审批？

它不是学习系统，也不使用 LLM，更不会从历史行为自动放宽权限。

———

## 修正后的方案

原来的权限方案需要收缩成：

1. 只对结构化操作提供细粒度、可记忆规则。
2. Elysia 路由、CLI 命令、扩展工具在定义处声明操作语义。
3. 通用 bash、原始 SQL、未知 fetch 一律视为不透明操作。
4. 标准模式下，不透明操作默认询问，而且原则上不生成永久细粒度规则。
5. 完全信任模式下，不透明操作直接允许。
6. HTTP 写接口必须在服务端验证 Agent/Session 身份，防止使用 curl 绕过。
7. 如果 Agent 拥有不受限制的 bash 和数据库文件访问，就不能声称实现了强权限隔离；这时只能选择完全信任，或者引入真正的进程/文件沙箱。

最关键的一句话是：

> 权限系统不能从任意 bash、SQL、fetch 中可靠推断业务语义；业务语义必须由结构化工具和路由主动声明。否则所谓细粒度权限只是看起来安全。
