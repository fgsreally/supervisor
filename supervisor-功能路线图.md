# Supervisor 功能路线图（讨论稿）

> **状态：讨论中，未锁定任何功能。**  
> 本文档只记录**经讨论并认可**后才会写入的条目。  
> 全量参考见 `参考项目功能研究.md`（110+ 项，含特定场景能力）。

---

## 筛选标准（共识后再改）

纳入路线图须同时满足：

1. **普适提效** — 对大多数 coding 任务都有帮助，而非仅 monorepo / 语音 / 多设备等特定场景。
2. **扩展可实现** — 以 `defineExtension` + `registerTool` + 现有事件为主；若必须改 pi-agent-core / SessionManager，单独标注「需核心配合」。
3. **你已认可** — 讨论通过后再从下方「待讨论」移到「已确认」。

---

## 扩展系统当前能做什么（边界）

| 能力 | API / 事件 |
|------|------------|
| 注册工具 | `ctx.registerTool` / `ctx.agent.tools.register` |
| 拦截/改写工具 | `tool.before_call`（block、改 args）、`tool.after_call`（改 result） |
| 会话钩子 | `session.start` / `session.end` / `agent.end` |
| 压缩钩子 | `compact.before` / `compact.after` |
| 持久化 | `appendEntry`、`ctx.db`、`getSessionDir()` |
| 注入消息 | `sendUserMessage`、`sendMessage` |
| 已有打包扩展 | read、edit、lsp、ask、ast-grep、output-minimizer、subagent |

**较难单靠扩展完成（需核心或 UI）：** 工具并行调度、子代理 Inbox 总线、权限 Diff 弹窗、compaction prompt 本体、ACP/远程执行。

---

## 待讨论：扩展向 + 普适提效候选

以下是我从三项目研究中筛出的 **8 项**，请你逐项表态（要 / 不要 / 暂缓 / 需核心配合）。

### 1. 先读后改（read-before-edit）

- **做什么**：edit/write 前检查本会话是否 read 过该文件；未读则返回可恢复错误，引导模型先 read。
- **怎么做**：扩展监听 `tool.before_call`（edit/write）+ `tool.after_call`（read），session 级 path 集合。
- **参考**：MiMo-Code `read-state.ts`、opencode `file.go`
- **提效点**：减少盲 patch，几乎对所有改代码任务有效。

### 2. 工具输出预算（大结果落盘 + preview）

- **做什么**：grep/bash/read 等返回超阈值时，全文落 session 目录，工具结果只留 preview + 路径。
- **怎么做**：增强现有 `output-minimizer` 或新扩展，在 `tool.after_call` 截断/落盘。
- **参考**：kimi-code `tool-result-budget.ts`、MiMo-Code `truncate.ts`
- **提效点**：防止单次工具撑爆上下文，长会话稳定性显著提升。

### 3. 工具调用去重提醒

- **做什么**：相同工具+相同参数连续重复时，在结果中追加 `<system-reminder>` 逐级升级。
- **怎么做**：扩展维护 canonical args 指纹，`tool.after_call` 改写 result。
- **参考**：kimi-code `tool-dedup.ts`
- **提效点**：防 doom loop，成本低，普遍有效。

### 4. LSP 诊断注入 edit 结果

- **做什么**：edit/write 执行后自动查 LSP 诊断，追加到工具返回，形成修改→看错误→修复闭环。
- **怎么做**：包装 edit 扩展（或新扩展覆盖 edit），写后调现有 lsp 扩展逻辑。
- **参考**：opencode `edit.go` 自动 `getDiagnostics`
- **提效点**：直接提高「写对」率；需用户安装 lsp 扩展 + 本地 LSP 可用。
- **备注**：扩展可实现，但依赖 lsp 打包扩展已安装。

### 5. 专用 grep / glob 工具

- **做什么**：独立 fast-path 搜索工具（ripgrep），结果按 mtime 排序、条数限制。
- **怎么做**：新打包扩展 `registerTool`，不依赖 read 扩展内嵌 bash grep。
- **参考**：opencode grep/glob、MiMo-Code grep
- **提效点**：探索代码库是 agent 最高频动作之一。

### 6. 敏感路径拦截

- **做什么**：read/grep 命中 `.env`、密钥等路径时拒绝或过滤，避免 secrets 进上下文。
- **怎么做**：扩展 `tool.before_call` + 路径 glob 规则。
- **参考**：kimi-code `sensitive.ts`
- **提效点**：安全 + 减少模型被密钥干扰；对所有项目普遍有意义。

### 7. TodoList 结构化任务工具

- **做什么**：模型可读写结构化 todo（pending/in_progress/done），状态持久化到 session。
- **怎么做**：纯扩展工具 + `appendEntry` 或 session 文件；可选 `agent.end` 低频提醒。
- **参考**：kimi-code `todo-list.ts`
- **提效点**：多步骤任务不易丢步；比 Plan Mode / Goal Mode 轻得多。
- **是否纳入**：你方需确认是否认为 todo 属于「普适」还是「可选习惯」。

### 8. Compaction handoff prompt 优化

- **做什么**：改进 rolling compaction 的摘要指令 + system.md 中「如何接续 summary」教育。
- **怎么做**：**主要改核心** `compaction/` 与 `system.md`；扩展只能在 `compact.before` 注入 `customInstructions` 做补充。
- **参考**：kimi-code `compaction-instruction.md`
- **提效点**：长会话不失忆；扩展只能辅助，**需你确认是否算路线图项还是核心维护项**。

---

## 已确认（讨论通过后填入）

| ID | 功能 | 实现方式 | 确认日期 | 备注 |
|----|------|----------|----------|------|
| | | | | |

---

## 明确不纳入（讨论后记录，避免重复争论）

| 功能 | 原因 |
|------|------|
| | |

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-09 | 改为讨论稿；清空预填 Phase 列表 |
