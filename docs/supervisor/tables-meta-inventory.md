# 非 Session 表 · meta 盘点（含是否移出）

> 原则（与 sessions 一致）：**核心状态进列；扩展/可变结构留 meta。**  
> 判定列：`移出 meta？` → **是 / 否 / 删除**  
> 日期：2026-07-27

---

## 先弄清两张「容易懵」的东西

### `home_tasks` 表是干什么的？

**首页任务板（跨 Session 的待办/工单），不是某个 Session 里的 Goal/Todo。**

| | 说明 |
|---|---|
| 用途 | 用户在「首页」建任务：标题、描述、优先级、所属项目；可拆成子任务；子任务可绑定一个 Session 去执行 |
| 和 Session 的关系 | `session_id` 可选；Session 状态变化会同步回任务状态（`home-task-sync`） |
| 和 `session_tasks` / `session_todos` 的区别 | 后者挂在**单个 Session** 上（对话内 Goal/清单）；`home_tasks` 是**产品级任务列表**，可跨多个 Session |
| 典型流程 | 建根任务 → `decompose` 拆子任务 → 每个子任务 `spawn` Session → Session 跑完任务标 done |

表上已有列：`title` / `description` / `project_id` / `status` / `priority` / `parent_id` / `session_id` / `error` / `meta`。  
**`meta` 里目前几乎只有 `source: "decompose"`（标记子任务来自拆解），不是业务主字段。**

### `agents.meta.packagedKind` 是干什么的？

Supervisor **出厂自带的几类固定 Agent** 的稳定标识，用来在代码里「按种类找那一行 Agent」，而不是靠显示名：

| 值 | Agent | 干什么 |
|---|---|---|
| `shadow` | Shadow | 回合结束后静默观察 / 记忆 |
| `btw` | BTW | 「顺便问」只读旁路 |
| `intro` | Intro | 引导 / 扩展编写助手 |
| `coding` | Coding | 默认可 spawn 的编码助手 |
| `watson` | 华生 | 内部工具任务（解析项目、清 worktree 等，不给用户开 Session） |

代码入口：`findPackagedAgentId(db, "coding" | "btw" | …)`。  
名字可以改、翻译可以变，**种类字符串要稳定**，所以适合独立列（如 `packaged_kind`），而不是埋在 meta 里靠名字兜底。

---

## 范围：哪些表有 `meta`

| 表 | 有 meta？ | 一句话 |
|---|---|---|
| `agents` | 是 | Agent 配置与出厂种类 |
| `projects` | 是 | 项目描述 / runtime 解析状态 |
| `messages` | 是 | 消息已读、附件等 |
| `home_tasks` | 是 | 首页任务（见上） |
| `resources` | 是 | skill/mcp/extension 目录项 |
| `sessions` | 是 | 已单独迁移，本文不覆盖 |
| `members` 等 | 否 | — |
| `jobs*` | 用 `metadata` | 另册 |

---

## 1. `agents.meta`

| key | 说明（干什么） | 移出 meta？ | 理由 |
|---|---|---|---|
| `builtin` | 是否 Supervisor 内置 Agent（防用户当普通 Agent 乱改/乱删） | **是** → `is_builtin` 或与现有 `is_internal` 合并理清 | 权限/过滤逻辑会查；和列级标志同类 |
| `userSpawnable` | 用户能不能用这个 Agent 开 Session（Shadow/BTW/华生为 false） | **是** → 列，或 **删掉只靠 `is_internal` 推导** | 创建 Session 的硬门槛；二选一，不要 meta + 列双轨 |
| `packagedKind` | 出厂种类：shadow/btw/intro/coding/watson（见上文） | **是** → `packaged_kind TEXT NULL` | 运行时按种类查找；稳定标识不应靠 JSON |
| `externalKind` | 外部 Agent 种类：codex/claude/kimi | **是** → 列，或并入 `backend_type` 体系 | 与启动路径绑定；和 `backend_type` 理顺后可只留一处 |
| `command` | 外部/ACP 可执行命令 | **是**（建议与下三项组成「外部配置」列或结构化列） | 启动必需；核心配置 |
| `args` | CLI 参数 | **是**（同上） | 同 command |
| `env` | 额外环境变量 | **是**（同上） | 同 command |
| `permissionPolicy` | ACP 权限策略 allow_once / reject_once | **是**（同上） | 启动/审批行为依赖 |
| `disabledTools` | 该 Agent 永久关掉的工具名列表 | **是** → JSON 列或 TEXT | 运行时过滤工具；Agent 级配置 |
| `external` | **旧**嵌套对象，装过 command/args/… | **删除**（迁移 flatten 后） | 已读时摊平到顶层；留着只制造双源 |
| `category` | UI 联系人分组（frontend/backend…） | **否** | 纯展示；且当前几乎无写入。要用就留 meta，不要占列 |
| 其它任意键 | HTTP/扩展自定义 | **否** | 留给扩展袋 |

---

## 2. `projects.meta`

### 简介 / runtime 到底在干什么？

创建项目后会跑 **一次华生任务**（`runProjectRuntimeParse` / kind=`project-parse`），同时产出：

1. **`description`**：中文项目简介（给列表/设置展示）
2. **`scripts`**：install / start / destroy 命令 → 写入 **`project_scripts` 表**（不在 meta）

所以：**简介生成已经用华生**，不是另一条 LLM 管道。  
`descriptionStatus*` 与 `runtimeStatus*` 目前被写成两套几乎相同的状态，**没必要**。

| key | 说明（干什么） | 移出 meta？ | 理由 |
|---|---|---|---|
| `description` | 项目简介正文 | **是** → `description TEXT` | **唯一需要保留的简介字段** |
| `descriptionStatus` | 与 runtime 重复的 pending/ready/… | **删除** | 和华生解析同一任务；勿双轨 |
| `descriptionError` | 与 runtimeError 重复 | **删除** | 同上，错误留一处即可 |
| `descriptionUpdatedAt` | 时间戳 | **删除** | 用 `projects.updated_at` |
| `descriptionSessionId` | 从未使用 | **删除** | 死字段 |
| `runtimeStatus` | 华生项目解析是否完成（pending/ready/error/skipped/none） | **是** → 一列即可，或改名 `parse_status` | `session-services` 启动本地服务前检查「脚本是否已解析好」 |
| `runtimeError` | 华生解析失败原因 | **是** → `parse_error`（可选） | 给 UI/排查；与简介错误合并为这一处 |
| `runtimeUpdatedAt` | 解析完成时间 | **删除** | 用 `updated_at` |
| `runtimeCommitSha` | 华生改端口后本地 commit 的 hash | **否** | 诊断用；偶发，留 meta |

**结论：** meta/列侧只保留 **`description` + 一套解析状态（现 `runtime*`，建议改名 parse_*）**；脚本本体在 `project_scripts`。

---

## 3. `resources.meta`

| key | 说明（干什么） | 移出 meta？ | 理由 |
|---|---|---|---|
| `builtin` | 是否内置 extension（禁止覆盖/卸载） | **是** → `is_builtin` | 安全边界；和 sessions/agents 同模式 |
| 其它任意键 | 自定义 catalog | **否** | 扩展袋；install 多数写 `{}` |

---

## 4. `messages.meta`

| key | 说明（干什么） | 移出 meta？ | 理由 |
|---|---|---|---|
| `read` | 这条消息用户是否已读（未读角标） | **是** → `read INTEGER` | **已有 SQL `json_extract(meta,'$.read')`**，说明该过滤；进列更干净 |
| `assets` | 附件列表（path/name/mediaType…） | **否** | 变长数组；除非要按附件查询再拆表 |
| `liteTruncated` | lite API 响应里临时标「截断」 | **否（且不应落库）** | 只在序列化时出现，不是持久状态 |
| 其它任意键 | extension `patchMeta` | **否** | 扩展袋 |

---

## 5. `home_tasks.meta`

| key | 说明（干什么） | 移出 meta？ | 理由 |
|---|---|---|---|
| `source` | 子任务是否由 `decompose` 拆出来（值如 `"decompose"`） | **否** | 弱溯源；UI 不读、不筛选；不值得占列。真要筛可再升 |
| 其它任意键 | HTTP 透传 | **否** | 扩展袋；Web UI 创建通常不传 |

> 表本身要保留；只是 **meta 几乎可以一直空着**，不需要为 `source` 专门加列。

---

## 汇总：建议动手顺序

| 优先级 | 表 | 动作 |
|---|---|---|
| 1 | `agents` | 升列：`packaged_kind`、内置/可 spawn、外部启动配置、`disabled_tools`；删 `external` |
| 2 | `projects` | 升列：仅 `description` + 一套 parse 状态；删掉全部 `descriptionStatus/Error/…` 双轨 |
| 3 | `resources` / `messages` | `is_builtin`；`messages.read` |
| — | `home_tasks` | **表保留，meta 不动**（继续当扩展袋） |

你按「是 / 否 / 删除」拍板后，再改 schema。
