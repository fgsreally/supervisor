# Job

Job 是系统、UI 与扩展共享的执行记录，不是模型直接调用的新工具。

## 持久模型

`jobs` 的每行表示一次执行，记录 kind、status、execution mode、能力、输出、进度、结果、错误、
metadata 与起止时间。完整列见[数据库结构](/supervisor/schema-reference)。Supervisor 重启时，
遗留的 queued/running/waiting Job 会标为 `interrupted`；记录可继续查看，底层进程不会恢复。

定时定义不在 Job 表。`sessions.meta.timers` 保存一次性或周期 timer；每次触发才创建独立的
`timer.fire` Job。旧 `job_schedules` 会一次性迁移到 Session meta 后删除。

扩展使用 `ctx.jobs.create/get/list/update/cancel/input`，并按能力注册取消或输入 handler。
`persistent-bash` 把后台 shell 注册为 Job；旧 `/bash-sessions*` HTTP 路径仅作兼容别名。

## Web UI

Session Job Popover 合并展示 timer 定义和执行记录。`capabilities` 决定可用操作，当前包括
`cancel`、`input`、`read_output`、`retry`。短输出可内联查看，长输出与终端内容使用详情视图。

相关：[扩展 API](/supervisor/extensions)、[HTTP API](/supervisor/http-api)。
