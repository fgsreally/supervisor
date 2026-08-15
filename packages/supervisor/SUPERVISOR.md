# pi-supervisor 包说明

`pi-supervisor` 是多 Session AI Agent 编排运行时，负责 Session 生命周期、SQLite 持久化、HTTP API、Agent 资源、扩展框架、内置工具和 Watson 辅助任务。

## 核心概念

- Agent：长期存在的配置实体，持有模型、system prompt、工具预设和资源绑定。
- Session：运行和持久化单位，通过 `agent_id` 使用某个 Agent。
- Extension：按 Agent 加载；`setup(ctx)` 每个 Agent generation 执行一次，通过 `agent.on("session.setup", ...)`初始化已加载 Session。
- Policy：隐藏扩展，先于普通 Session 扩展 handler 执行，可由 Agent 或普通扩展禁用。
- Watson：内部临时 runner，不创建 Agent 或用户 Session。

## 出厂 Agent

原生出厂 Agent 只有：

- `Coding`
- `Smart Router`
- 配置了模型后创建的 `Pi 助手`

外部后端还会注册 Codex、Claude Code、Kimi Code、Cursor 和 MiMo Code。

`Intro` 已合并进 `Pi 助手`，只保留旧数据迁移兼容。

## Shadow 与 BTW

Shadow 和 BTW 都不是内部 Agent，也不会在 `agents` 表中创建对应实体：

- Shadow 是主 Session 每轮结束后触发的 Watson 分析能力。结构化输出写入 `sessions.meta.shadow`。
- BTW 是 `spawn_type = "btw"` 的派生 Session，复用父 Session 的 Agent，并在当前 Session 范围强制 readonly。

启动时若发现旧版本创建的 `Shadow` 或 `BTW` Agent 行，会先把关联 Session 迁移到实际 Agent，再删除旧行。

## 目录

```text
packages/supervisor/
├─ resource/agents/       # 真正出厂 Agent 的 system prompt
├─ resource/prompts/      # Session/系统能力使用的 prompt 片段
├─ src/agent/             # Agent 注册、资源和运行时
├─ src/core/              # Session、Watson、队列和生命周期
├─ src/extension/         # 扩展、隐藏策略和内置能力
├─ src/http/              # HTTP API
├─ src/tools/             # 打包工具
└─ test/                  # Vitest 测试
```

## 关键约定

- `sessions.meta` 与 `projects.meta` 主要保存扩展数据；核心身份和 UI 状态使用数据库列。
- 模型和 tools preset 只由 `agent_id` 对应的 Agent 决定。
- Session system prompt 在对话时由 Agent prompt、AGENTS.md 和 Session services 动态拼装。
- BTW、subagent、fork、clone 是 Session 派生类型，不是 Agent 类型。
- Shadow runner 使用助手模型和终止型 `submit_result`，不走第二套 Agent 系统。
