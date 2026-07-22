# Job

Job 是 Supervisor 提供给系统、界面和扩展的统一执行视图，不是要求模型直接调用的新工具。

## 模型

- `JobRecord` 表示一次执行，记录类型、状态、输出、能力和起止时间。
- `JobSchedule` 表示尚未触发或周期触发的计划；每次触发会产生独立 Job。
- Job 归属于 Session，并持久化到 Supervisor 数据库。
- Supervisor 重启时，未完成的记录会标记为 `interrupted`。记录可以恢复查看，但底层进程不会自动恢复。

扩展通过 `ctx.jobs` 创建和更新 Job，并按实际能力注册取消或输入处理器。HTTP 和 Web UI 只与 Job 交互，不需要知道底层是 shell、timer、MCP 或其他实现。

目前 `timer` 使用 Job Schedule，并在触发时创建 Job；`persistent-bash` 将后台 shell 注册为 Job。旧的 Persistent Bash HTTP 路径暂时保留为兼容别名。

## Web UI

会话页头部只有一个 Job Popover，统一展示计划和执行记录：

- 简短输出在 Popover 内展开。
- 一般详情使用弹窗。
- 长输出和终端内容使用分屏详情。
- 支持能力由 `capabilities` 声明，例如 `cancel`、`input` 和 `read_output`。

相关：[扩展框架](/supervisor/extensions)、[HTTP API](/supervisor/http-api)。
