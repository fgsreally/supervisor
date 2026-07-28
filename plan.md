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




----


文件
    读取项目文件                     始终允许
    修改项目文件                     始终允许
    访问项目外文件                   每次询问
    删除文件                         每次询问

  命令
    执行项目脚本                     始终允许
    安装依赖                         每次询问
    执行系统命令                     每次询问

  网络
    调用 Supervisor 本地接口         始终允许
    访问其他网络地址                 每次询问

  Supervisor 管理
    查询配置和运行状态               始终允许
    修改 Agent、扩展和资源           始终允许
    修改全局设置                     每次询问

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
                                                                                                                                                                                                  
   模式        行为                                                                                                                                                                               
  ━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                                                                                                                                 
   受限        读取允许，写入、命令和网络基本都询问                                                                                                                                               
  ──────────  ───────────────────────────────────────────────────                                                                                                                                 
   标准        项目内修改允许，项目外操作和危险命令询问                                                                                                                                           
  ──────────  ───────────────────────────────────────────────────                                                                                                                                 
   完全信任    Supervisor 可控制范围内基本允许，只拦截明确禁止项                                                                                                                                  
                                                                                                                                                                                                  
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
                                                                                                                                                                                                  
  Pi 助手可以安装 npm 扩展                    [删除]                                                                                                                                              
  Pi 助手访问公网时需要询问                   [删除]                                                                                                                                              
  任何 Agent 都不能读取 ~/.ssh                [删除]                                                                                                                                              
                                                                                                                                                                                                  
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
  + 内置 supervisor-admin                                                                                                                                                                         
  + Supervisor 自身数据库                                                                                                                                                                         
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