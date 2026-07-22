# Agent 能力对比与后续方向

本文记录对 `kimi-code`、`MiMo-Code`、`oh-my-pi` 的 Agent 能力对比，以及结合 Supervisor 现状形成的取舍。

## Supervisor 已有基础

Supervisor 已具备以下能力，不需要重复建设：

- Session Tree、子 Session 与后台子 Agent
- Steer、Follow-up 与输入队列
- Goal、Plan、Todo 与 Timer
- 对话和 Git Checkpoint、Rewind
- Rolling Compaction
- 工具策略与 before/after hooks
- 工具输出压缩
- Shadow Observer
- Hindsight 长期记忆扩展

## MiMo Actor 的含义

Actor 是“有身份、有状态、可重复通信的 Agent 执行单元”。相较一次性的 `spawn_agent`，MiMo 额外描述了：

- 生命周期：`ephemeral` 或 `persistent`
- 身份关系：`main`、`peer` 或 `subagent`
- 上下文继承：`none`、`state` 或 `full`
- 工具白名单
- `pending`、`running`、`idle` 状态
- `success`、`failure`、`cancelled` 结果

Supervisor 已经用父子 Session 表达相同的基础关系，也已有 `children()`、`sendToChild()`、`waitForResult()` 和 `finish()`。因此不应再引入一套 Actor 存储模型。更合适的方向是把现有能力补成模型可调用的完整协议：

- `list_agents`
- `send_agent`
- `wait_agent`
- `cancel_agent`

第一阶段不必引入 persistent Actor 和复杂的上下文继承模式。

## Shadow Memory 与 Hindsight

两者用途不同：

- Shadow Memory 位于 Session 专属目录，只供 Shadow Observer 保留自身工作状态、风险和已发建议。
- Hindsight 才是主 Agent 使用的长期记忆能力，提供 `retain`、`recall`、`reflect`、自动 retain/recall、项目作用域、远程 API 和本地 JSONL fallback。

因此不再建设另一套长期记忆系统。Hindsight 后续可增强记忆查看、来源追踪、删除修正、注入可观测性和 Mental Models。

## 工具调用循环检测

工具循环检测是近期优先事项。系统应识别连续 Turn 中工具名、规范化参数和结果摘要均相同的调用，例如反复读取同一不存在文件或高频轮询未完成任务。

建议行为：

1. 前两次正常执行。
2. 第三次执行并向 Agent 注入重复提醒。
3. 第四次阻止调用，要求改变方案或说明理由。
4. `wait`、状态查询、日志监控等工具可豁免或提高阈值。

该能力可以通过扩展监听 `tool.after_call`、`turn.ended`，结合 `session.tools.beforeUse()` 和 `inject.schedule()` 实现，不需要侵入 Agent Harness。

## 可恢复错误分类

当前工具错误主要表现为 `isError` 或普通异常，运行时不能可靠区分处理策略。后续可增加可选的结构化错误信息：

```ts
interface ToolErrorDetails {
  kind:
    "invalid_input" | "not_found" | "permission_required" | "retryable" | "cancelled" | "internal";
  recoverable: boolean;
  suggestion?: string;
  retryAfterMs?: number;
}
```

典型处理：

- 参数或路径错误：模型修改参数后重试。
- HTTP 429、网络超时：根据退避时间重试。
- 缺少授权或密钥：请求用户处理，不盲目重试。
- 内部状态损坏：明确展示系统故障并停止自动尝试。

第一阶段只增加分类和 UI 呈现，不自动重试；它可以作为工具循环检测的配套基础。

## 内存型持久 Bash

持久 Bash 用于运行开发服务器、Watch、测试、构建等不会立即结束的命令，并允许 Agent 或用户后续读取输出、写入 stdin 和停止进程。

它与后台子 Agent 不同：Bash 运行普通程序，不持续消耗模型 Token。

本项目的 Bash 会话只在 Supervisor 服务进程内存中存在，不写数据库。原因是服务退出后子进程也应被终止，恢复一条已不存在的进程记录没有意义。UI 在会话标题栏显示 Bash 数量，点击后通过 Popover 查看终端输出并进行输入或停止操作。

## 当前优先级

1. 工具调用循环检测。
2. 补全子 Agent 的 list/send/wait/cancel 操作。
3. 增加可选的工具错误分类，不立即做自动重试。
4. 持续完善 Hindsight 的管理和可观测性。
5. 通用 Job Manager 暂缓；只有非 Bash、非 Agent 的后台任务需求增多时再抽象。
