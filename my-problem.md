# coding agent

## 问题列表

1. 污染，
2. 费用
3. 人的需求模糊
4. ai只会闷头干活且只顾着实现，片面性
5. 循环目标模糊
6. 某些环节需要主观能动性，而有些不需要
7. ai洋洋洒洒解释了一大堆，懒得看，进度不知情
8. 开发过程不合规

我说一个场景，当我要求设计一些接口，写完以后我要求补上测试，那么agent给的测试一定会“画靶射箭”，没有实际意义（污染问题），而接口的大部分其实是很简单的，根本不应该使用昂贵模型（费用问题），接口中有一个字段是“创建人”，它能不能修改这件事，可能我自己也没有想清楚，也可能我清楚但忘了跟agent说，导致做出来的东西不对（需求模糊问题），agent不会去保证实现优雅，结构合理，它只顾着实现我说出的需求，最后变成，功能确实对了，这几个接口都能用，但实现和我预期差异很大，后面我要加上一个新接口，这个新接口和旧接口有一部分是完全一样的，按正常开发逻辑，肯定是将这个部分封装并复用，而agent只会重复一遍（片面性）。
当我实现更复杂的功能，比如要实现大批的接口，我通过plan模式，按理来说我的需求在这种模式表达的比较清楚，但最后的效果是，agent很快就跟我说它做完了,但实际效果差很多，因为没有确定的标准和限制，去强迫agent循环，导致“偷懒”，就算强制循环，缺少具体约束，只会越发偏离（问题5）
当我想把一个接口字段修改一下，agent往往会在兼容旧的模式下，支持新字段，但此时接口还在开发阶段，根本不应该考虑兼容，这就是不必要的主管能动性，而有的时候有一些需求我自己都没想清楚，但我自己不知道，agent意识到应该提醒我询问我，而大多时候agent只会闷头去开始实现
agent修改完文件后，往往会给一大段md格式的解释，我需要知道的可能只有：完成了没有，有哪几个接口，有哪些不太确定或者需要注意的，这种功能只需要很少量的，5行左右的说明就行了，而很多时候agent会想写论文一样写一大堆正确但我不想看的东西，很多时候导致我只能看都不看，一直accept，我连此时执行的进度都不知道。
而且我很多时候思维是跳跃的，比如我这会想做a功能，等会又做b功能， 又或者此时根本确定需求，我就让agent去做了，这都不是合理的开发模式。而agent只会附和我（过程不合规），需要限制agent灵活性

## 我的需要

在我当前的使用过程中 ，这些coding agent 给我的感觉都是： 提供很有用的功能，但只提供了低维度的功能。

举个例子，react 功能很强大，把底层的响应式和dom渲染封装了，但如果我们要使用react，还是要做很多工作，而像nextjs，就是在react基础上，提供了真实业务中的一些准备，让我能够专心业务。

我希望有一个 类似nextjs ，做出了更高封装，从更高维度出发 的coding agent。我在使用cursor/claude code 以及其他时，都是初始愉快的定好了任务，愉快的让ai编写代码（我寄希望于完全自动的开发，就是一觉起来所有工作都已经完成），

但在某一个节点以后，我会对当前的进度一无所知/我会发现一些新的需求/ai会对一些问题视而不见/ai 会错误地添加修改删除某个功能/ai会遗忘之前我的一些交代/ai当执行到一部分后，会惰性不再无限执行下去/ 好的模型太贵，而差的模型会把一切搞得一团糟。 导致最后我不得不又回归到，自己查看问题，自己调试，自己去应用预览，然后在回归到和ai的一问一答的过程。（这些问题和上面的问题大都重合）

上述我的使用，其实就是plan 模式，也是我口中低维度的操作，我希望实现一个高维度的agent，比plan 更高位的模式，（其实就是解决开发不合规问题并间接解决其他问题

我的设想如下：准备阶段
1，ai 主动询问这个应用的使用场景，使用的用户有哪几类，每个类他们有什么需求，需要设计什么核心功能 （简答） 提供一些同类产品让用户确认，
2 如果是有可视界面，那么最核心界面有哪些，不同身份的操作线以及条件分支（需要有图），其他交互方式，如命令行/接口 同理 。
3 项目是否有分包可能，monorepo
4，约定技术栈/文件规范/代码规范，
5，任务分期，除非是极为简单的，两百行内可以解决的，尽可能让每期任务短（只保留前五个分期，一期不要修改超过6个业务代码文件（不包括测试文档说明等文件）），

进入分期 ：分期准备阶段，
5.1，界面小样，如果这期任务没有界面，那么就忽略这一步，直接到下一步， 这里通过html+tailwindcss+技术栈里的组件库 ，实现最基本的静态页面（有最简单的交互如popover/modal），让用户确认设计风格是否符合审美

5.2， 测试编写，主要是单测和链路场景测试，如果为web 界面，需要有e2e测试（依赖plarwright）， 要用简明的语句，说明每个单元测试的目的， 以及每个链路测试对应实际生产场景中的例子，要用最简说清，比如学生进入点击按钮x，跳转到y页面，可以看到z列表，或者 员工发起审批，经理点击同意，员工查看效果...，

以上每个阶段 ，都需要询问用户 ，让用户提供新的意见（或者一个简单的延展选项） 直到用户确认进入下一步骤，否则就在同步骤里一直循环， 开始施行环节，将测试结果返回给大模型， 不断循环（ 用户可以打断输入新的提示，），直到所有测试通过。（如果有链路ui测试， 需要把视频录制下来），用户也可以看到此时此刻，当前任务完成度（测试通过数），然后进入下一期任务，重复这个流程。直到所有任务完成， 有2个选择，1， 精雕细琢，一问一答，主要用于优化视图 2， 回到任务分期，重新制定更多分期，然后又进入分期，以此类推。很明显，现在的agent肯定不符合我这么复杂的需要，你觉得应该怎么设计一个新的agent（先不修改代码，只和我探讨可能性）要怎么灵活利用当前的架构。

以上只是我的初期想法，并不代表我完整的真是需要，

我最近对sdd开发很感兴趣，尤其是[openspec](https://github.com/Fission-AI/OpenSpec/tree/053d8a59d587f3c027a06ad80503a6b43d4f2a92) 和[superpowers](https://zhuanlan.zhihu.com/p/2024869894936601639), 请你融合我的想法，和这两个方案，设计一个新的，完整的开发模式（只用简单文字说明补在这个文件后面，不用写代码，我们后续会重构当前代码仓库pi，来支持这个开发模式）

---

## 新开发模式设计

### 一、文件结构

```
openspec/
├── project.md              # 产品背景（只通过 archive 更新）
├── design.md               # 技术大方向（只通过 archive 更新）
├── specs/                  # 能力规格（只通过 archive 更新）
│   └── [capability]/
│       ├── spec.md         # 行为规格
│       └── mockup.html    # 能力小样
└── changes/                # 所有进行中的工作都在这里
    ├── [change-name]/     # 一个 change = 一个文件夹 = 一期
    │   ├── proposal.md     # 提案：从/到/原因/影响
    │   ├── project.md    # 对 openspec/project.md 的增量
    │   ├── design.md     # 对 openspec/design.md 的增量
    │   ├── tasks.md      # 实现清单，每个 task 含具体文件
    │   └── specs/
    │       └── [capability]/
    │           ├── spec.md      # delta spec
    │           └── mockup.html
    └── archive/
        └── YYYY-MM-DD-[name]/
```

**核心原则**：整个流程期间，openspec/ 下的文件均不直接修改。所有工作产物写入 `changes/[name]/`，archive 时才合并到 openspec/。

**spec.md 格式**（来源：**OpenSpec**）：

```
## Purpose
这个能力域的职责说明

### Requirement: [名称]
系统 SHALL/MUST/SHOULD 满足的行为

#### Scenario: [场景描述]
- GIVEN 初始状态
- WHEN 触发条件
- THEN 预期结果
- AND 附加结果
```

**delta spec 格式**（来源：**OpenSpec**）：

```
## ADDED Requirements
### Requirement: 新增的需求名
...

## MODIFIED Requirements
### Requirement: 已有的需求名（header 必须和 specs/ 里一致）
...（完整写出修改后的内容，可加 ← (was X) 注释）

## REMOVED Requirements
### Requirement: 要删除的需求名
- Reason: 为什么删

## RENAMED Requirements
- FROM: ### Requirement: 旧名
- TO: ### Requirement: 新名
```

archive 时，工具按 RENAMED → REMOVED → MODIFIED → ADDED 顺序将 delta 合并回 specs/，change 文件夹移到 archive/YYYY-MM-DD-[name]/。

---

### 二、完整流程（严格顺序，不可跳过）

每个阶段结束时的选择，**只有需要主观能动性的阶段才有"继续探索"选项**：

- **头脑风暴 / Design / Mockup**：commit 进入下一阶段 / 继续探索（Agent 给出几个方向） / 修改
- **Specs / Changes / tasks / 测试 / 验证**：commit 进入下一阶段 / 修改

---

**阶段 0：Brainstorm（头脑风暴）**（changes/[name]/）

目标：解决需求模糊问题，把用户真正的想法打出来。只考虑产品，不涉及技术细节。

用户先输入一段提示词。Agent 收到后：

1. 先读 openspec/ 感知现状（空项目 vs 已有项目）
2. 在 `changes/[name]/` 下写 proposal.md，说出自己对用户意图的理解并提出针对性追问
3. 用户选择：commit 进入 Design / 继续探索 / 修改

> **例**：用户说"我想做一个考勤系统"。Agent 读完 openspec/（空），列出自己的理解："这是一个面向企业内部的考勤管理工具，核心用户是员工和管理员"，然后追问：员工如何打卡（App/网页/硬件）？管理员的核心诉求是什么（报表/审批/异常告警）？考虑以下方向，请选择或补充：A) 只做打卡+统计 B) 打卡+审批+报表 C) 同时支持外勤打卡。用户选B并补充了外勤需求，Agent 更新 proposal.md 再次确认。

---

**阶段 1：Design（技术设计）**（changes/[name]/）

目标：确定技术实施方向。只考虑技术大方向，不涉及具体接口字段。

同样由用户提示词驱动。Agent 收到后：

1. 先读 openspec/design.md 和项目配置感知现状
2. 在 `changes/[name]/` 下创建/更新 design.md，说出自己对技术方向的理解并提出针对性追问
3. 用户选择：commit 进入 Spec / 继续探索 / 修改

> **例**：接上例，Agent 读 proposal.md 后说："考虑到需要支持移动端外勤打卡和后台报表，建议 monorepo，前端 Vue3 + Vite，后端 Node.js + Prisma，移动端复用 H5"，然后追问：数据库用 PostgreSQL 还是 MySQL？是否需要对接钉钉/企微？考虑以下方向：A) 纯独立系统 B) 对接企微。用户选了 PostgreSQL + 对接企微，Agent 更新 design.md 确认。

---

**阶段 2：Spec（能力规格）**（changes/[name]/specs/）

根据 proposal.md + design.md，在 `changes/[name]/specs/[capability]/` 下逐个能力写 spec.md。

capability 的划分原则：单一职责，动词-名词命名（如 `user-auth`、`attendance-checkin`、`report-export`），每个 capability 是一个独立的行为域，不同 capability 之间边界清晰。

遇到模糊字段，Agent 必须停下来列出选项强制决策，不允许默认实现。

用户选择：commit 进入 Mockup / 修改

> **例**：接上例，Agent 拆出以下 capability：`user-auth`（登录/权限）、`attendance-checkin`（打卡逻辑）、`attendance-review`（管理员审批异常）、`report-export`（报表导出）。然后逐个写 spec，写到 `attendance-checkin` 时发现"补卡是否需要审批"未明确，列选项：A) 补卡直接生效 B) 补卡需管理员审批 C) 由管理员配置。用户选C，记录进 spec。

---

**阶段 3：Mockup（能力小样）**

创建 worktree（来源：**superpowers**）：

```
git worktree add ../[project]-[name] [branch]
```

在 worktree 里的 `specs/[capability]/` 下创建 mockup HTML（来源：**我的想法**）：

- 每个 capability 独立 HTML 文件
- 界面能力展示核心交互，接口能力展示请求/响应/错误码，命令行能力展示参数/示例/输出
- 统一 HTML 是因为好懂、好预览

用户选择：commit 进入 Planning / 继续探索 / 修改

> **例（界面能力）**：`attendance-checkin` 的 mockup.html 展示打卡页面：顶部显示当前时间和位置，中间一个大打卡按钮，下方是今日打卡记录列表（上班/下班/外勤），点击"补卡"弹出一个 modal 填写时间和原因。用静态 HTML + Tailwind 实现，按钮点击有视觉反馈但不需要真实逻辑。

> **例（接口能力）**：`user-auth` 的 mockup.html 展示接口文档：
>
> ```
> POST /api/auth/login
> Request:  { username: string, password: string }
> Response: { token: string, user: { id, name, role } }
> Error:    401 { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" }
>           403 { code: "ACCOUNT_DISABLED", message: "账号已被禁用" }
> ```
>
> 用 HTML 表格或卡片排版，清晰展示每个字段的类型、是否必填、说明。

> **例（命令行能力）**：假设有一个 `report-export` 的 CLI 导出命令，mockup.html 展示：
>
> ```
> Usage: attendance export [options]
> Options:
>   --month <YYYY-MM>   导出月份（默认当月）
>   --dept  <id>        部门 ID（不填则导出全部）
>   --format <csv|xlsx> 输出格式（默认 csv）
> Example:
>   attendance export --month 2025-04 --dept 3 --format xlsx
> Output:
>   ✓ 已导出 128 条记录到 attendance_2025-04.xlsx
> ```

---

**阶段 4：Planning（任务规划）**（changes/[name]/）

Mockup 确认后，AI 读取所有 specs + mockup，按功能边界拆分 change，每个 change 下创建 delta specs + proposal.md + tasks.md：

- tasks.md 中每个 task 必须列出涉及的具体文件
- 每个 change ≤6 个业务文件
- 只保留前 5 个，后续动态追加

用户选择：commit 进入 Test / 修改

> **例**：接上例，Agent 将 4 个 capability 拆成 3 个 change：`change-01-auth`、`change-02-checkin`、`change-03-report`。change-02 的 tasks.md：
>
> - task 1.1：创建打卡记录 schema（`prisma/schema.prisma`）
> - task 1.2：实现打卡接口（`server/routes/checkin.ts`）
> - task 2.1：异常记录查询接口（`server/routes/review.ts`）
> - task 2.2：管理员审批接口（`server/routes/review.ts`）

---

**阶段 5：Test（测试编写）**

程序为每个 change 依次启动独立 sub-agent，专门从 specs/ 编写测试，绝不从实现反推，杜绝"画靶射箭"。

测试用 vitest 编写，每个 change 的测试用 `describe('[change-name]: ...')` 包裹，change-name 作为 describe 名称的固定前缀，供测试工具按 change 过滤执行。

所有 change 的测试全部写完后，用户统一确认。

用户选择：commit 进入 Implement / 修改

---

**阶段 6：Implement（实现循环）+ Verify（验证）**

所有 change 的测试确认后，程序为每个 change 依次启动独立 sub-agent 执行实现+验证，上一个 change archive 后再启动下一个，共用同一 worktree：

**实现循环**（由程序驱动，不由 agent 控制）：

1. 程序调用测试工具，按 change-name 过滤执行对应 describe 块（`vitest --reporter=json -t "^[change-name]"`），提取失败用例名称 + 错误信息
2. 程序将失败列表 + 错误信息发给 agent（agent 禁止自行执行测试）
3. Agent 只根据错误信息修改代码
4. 重复 1-3，直到程序收到零错误，自动进入验证

每轮 agent 输出固定格式（≤5 行）：

```
[change-name]
✓12 ✗3
? 疑问项（如有）
```

**验证**（来源：**superpowers**）：
Agent 主动做两项检查：

- 业务功能验证：对照 specs/ 逐条核查实现是否符合 Requirements + Scenarios
- 代码结构验证：检查是否有重复逻辑应封装、命名是否符合 design.md 规范

用户选择：commit Archive / 修改

**Archive 当前 change**（来源：**OpenSpec**）：

- merge 到 main
- 将该 change 下的 project.md / design.md / specs/ 合并到 openspec/ 对应位置
- 将该 change 文件夹移到 archive/YYYY-MM-DD-[name]/

继续下一个 change，直到所有 change archive 完毕，删除 worktree。

---

### 三、其他约束

**模型分层**（来源：**我的想法**）：spec 写作和消歧义分析用强模型；代码实现循环用弱模型。

**输出规范**（来源：**我的想法**）：固定 ≤5 行，禁止叙事，禁止解释"我做了什么"。

**合规约束**（来源：**我的想法** + **superpowers**）：

- specs 未确认 → 不创建 change，不写代码
- change 未确认 → 不进入 worktree
- 开发阶段 → 禁止向后兼容补丁（接口还在开发中，不需要兼容旧字段）
- 用户跳步 → AI 指出并记录 override，不附和

然后当前的pi其实是一个雏形，每启动一个实例控制一个对话，我希望有一个总控制器，就是管理所有实例，能够查看所有实例，然后能看到实例之间的关系，比如子代理，然后像我们刚才写好的这个多阶段的需求，那么每个实例最好有元数据meta，你可以用sqlite去让数据持久化与查询
