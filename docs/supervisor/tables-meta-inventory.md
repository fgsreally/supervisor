# 非 Session 表 · meta 盘点（收敛后）

> 原则：**核心状态进列；扩展/可变结构留 meta。**  
> 日期：2026-07-27（Timer 设定迁入 `sessions.meta.timers`）

---

## 已落地结论

### `agents`

| 列 | 说明 |
|---|---|
| `is_builtin` | 原 `is_internal` + `meta.builtin`；禁乱改/乱删 |
| `spawn_type` | 原 `meta.packagedKind`：`shadow` / `btw` / `intro` / `coding` / `watson` |
| `backend_type` | 运行时分发：`native` / `codex` / `claude` / `kimi` / `acp`（**保留**；不与 spawn_type 合并） |
| `external_config` | JSON：`{ command, args?, env?, permissionPolicy? }` |
| `disabled_tools` | JSON 字符串数组 |
| `meta` | **仅扩展袋**；下列键已删除/迁出：`builtin`、`userSpawnable`、`packagedKind`、`externalKind`、`command`、`args`、`env`、`permissionPolicy`、`external`、`category`、`disabledTools` |

- **无「禁止用户建会话」闸门**（已删 `userSpawnable` / `assertAgentUserSpawnable`）。UI 按 `isBuiltin` / `backendType` 过滤展示。
- 外部种类去重：用 `backend_type`，不再有 `externalKind`。

### `sessions.meta`（Session 服务型扩展状态）

| key | 说明 |
|---|---|
| `subagentIds` | `number[]`；原 `members` 表 spawned 白名单（**members 表已删**） |
| `tasks` / `currentTask` / `todos` | 原 `session_tasks` / `session_todos`（**表已删**）；Goal/Plan/Todo 由扩展写入 |
| `shadow.*` | Shadow 华生输出（建议问、status 等） |
| `git` | worktree / commit |
| `timers` | Timer **设定**（扩展配置）；触发执行仍写 `jobs` |
| `services` 等 | 扩展袋 |

- Shadow：只靠 `shadow_enabled` + 华生；不再支持 members 覆盖。
- BTW：复用父 Session `agent_id`，运行时强制 readonly。
- Timer 设定在 `meta.timers`；`job_schedules` **已删**（启动时迁移进 meta）。

### `home_tasks`

- **已删除 `meta` 列**。表保留（首页任务板）；`decompose` 溯源用 `parent_id`。

---

## 范围：哪些表还有 `meta`

| 表 | 有 meta？ | 说明 |
|---|---|---|
| `agents` | 是 | 仅扩展袋 |
| `projects` | 是 | 简介 / parse 状态等（另册清理） |
| `messages` | 是 | 附件等；`read` 建议升列 |
| `home_tasks` | **否** | 已删 |
| `resources` | 是 | `builtin` 建议升列 |
| `sessions` | 是 | 扩展 + tasks/todos/subagentIds/git/timers |
| `members` | **表已删** | — |
| `jobs` | `metadata` | **仅执行记录**；无 schedules 表 |
| `job_schedules` | **表已删** | → `sessions.meta.timers` |

---

## 仍待（非本次）

| 表 | 动作 |
|---|---|
| `projects` | `description` + 一套 parse 状态升列；删 descriptionStatus 双轨 |
| `resources` | `is_builtin` 升列 |
| `messages` | `read` 升列 |

---

## `spawn_type` 取值

| 值 | 用途 |
|---|---|
| `shadow` | 归因 / 出厂行（运行走华生） |
| `btw` | 提示词种子行（会话复用父 Agent） |
| `intro` | 引导 Agent |
| `coding` | 默认可用编码 Agent |
| `watson` | 华生内部 runner |
