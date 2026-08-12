# Job

Job 是系统、UI 与扩展共享的执行记录，不是模型直接调用的新工具。

## 产品语义（Web UI）

- **Jobs 托盘**：用户需要留意的后台（定时计划、`timer` 触发记录等）。
- **Eval**：只服务 Eval kernel（可多 language，如 js / py）；不混进长跑 bash。
- **后台终端**：持久 / 后台 bash（含 Vite、project-service `start:`）单独入口——
  PC 为独立 content tab（显示数量），移动端为右停靠悬浮球（左滑打开，相对活跃应用的右滑）。

## 持久模型

`jobs` 的每行表示一次执行，记录 kind、status、execution mode、能力、输出、进度、结果、错误、
metadata 与起止时间。完整列见[数据库结构](/supervisor/schema-reference)。

Supervisor 重启时：

- 遗留的 queued/running/waiting Job 标为 `interrupted`（记录可看，进程不恢复）
- `sessions.meta.services` 的进程绑定字段（`pid` / `jobId`、活着的 status）清回 `idle`；
  登记命令与 `apps` 保留
- Eval / 后台 bash **不**写在 meta（jobs 表 + session 目录 `eval/`）
- `sessions.meta.timers` **保留**（定时定义，不是运行中的进程）

定时定义不在 Job 表。`sessions.meta.timers` 保存一次性或周期 timer；每次触发才创建独立的
`timer.fire` Job。旧 `job_schedules` 会一次性迁移到 Session meta 后删除。

扩展使用 `ctx.jobs.create/get/list/update/cancel/input`，并按能力注册取消或输入 handler。
后台 shell / 项目服务仍写入 Job 表以便轮询输出，但 Web UI 默认不把它们当作「需要关注的 Job」。

## Web UI

Session Job Popover 合并展示 timer 定义和需关注的执行记录。`capabilities` 决定可用操作，当前包括
`cancel`、`input`、`read_output`、`retry`。Eval 与后台终端分开展示：Eval 走工具分屏；后台终端
走独立 tab / 悬浮球面板。

相关：[扩展 API](/supervisor/extensions)、[HTTP API](/supervisor/http-api)。
