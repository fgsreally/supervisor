# pi-supervisor 包结构与文件说明

`pi-supervisor` 是多会话 AI Agent 编排运行时：管理 session 生命周期、SQLite 持久化、HTTP API、扩展框架、内置工具与 Shadow 协作者。

入口：`cli.ts`（`pi-supervisor` 命令）或 `index.ts` 的 `startSupervisor()`。

---

## 文件树

```
packages/supervisor/
├── agents/                          # 内置 agent 的 prompt 模板
│   ├── shadow/prompt.md
│   ├── btw/prompt.md
│   ├── intro/prompt.md
│   ├── coding/prompt.md
│   └── assistant/prompt.md
├── prompts/                         # 随包分发的系统 prompt 片段
├── scripts/                         # 开发/调试脚本
├── src/                             # 运行时源码
│   ├── agent/                       # Agent 资源、技能、扩展安装
│   ├── config/                      # 全局配置
│   ├── core/                        # Session 核心（管理器、运行时、队列、压缩）
│   ├── db/                          # SQLite 数据层
│   ├── extension/                   # 扩展框架 + 内置扩展
│   ├── http/                        # HTTP API（Hono）
│   ├── resources/                   # 资源目录、绑定与加载
│   ├── testing/                     # 可公开复用的 AI 效果测试 API
│   ├── tools/                       # 内置打包工具（edit、lsp、web 等）
│   ├── utils/                       # 通用工具函数
│   ├── cli.ts                       # CLI 入口
│   ├── index.ts                     # 库入口与 re-export
│   └── types.ts                     # 共享类型定义
├── test/                            # 普通测试与 AI 效果测试
├── .env.example                     # 环境变量示例
├── package.json
├── tsconfig.build.json
├── tsdown.config.ts                 # 构建配置
├── vitest.config.ts                 # 普通测试
├── vitest.ai.config.ts              # *.ai.test.ts
├── vitest.shared.ts                 # 共享测试配置
├── SUPERVISOR.md                    # 本文件
```

---

## 根目录

| 文件                  | 用途                                  |
| --------------------- | ------------------------------------- |
| `package.json`        | 包元数据、依赖、`build` / `test` 脚本 |
| `tsdown.config.ts`    | 用 tsdown 将 `src/` 编译到 `dist/`    |
| `tsconfig.build.json` | 构建用 TypeScript 配置                |
| `vitest.config.ts`    | 普通测试运行配置                      |
| `vitest.ai.config.ts` | AI 效果测试运行配置                   |
| `vitest.shared.ts`    | 两类测试的共享配置                    |
| `.env.example`        | 可选环境变量说明（API Key 等）        |

---

## `agents/` — 内置 Agent

随包安装的内置 agent prompt。启动时由 `src/agent/builtin/index.ts` 写入 agent home 的 `SYSTEM.md`。

| 文件                  | 用途                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `shadow/prompt.md`    | Shadow 协作者（`is_internal`）：每轮主对话结束后分析记忆与安全，按需向父 session 投递消息；**不可**用于创建用户 session |
| `btw/prompt.md`       | BTW 只读侧问代理（`is_internal`）；**不可**用于创建用户 session                                                         |
| `intro/prompt.md`     | Intro 引导和扩展开发助手，使用 coding 工具；**可以**创建用户 session                                                    |
| `coding/prompt.md`    | 通用 Coding agent：项目开发与验证；端口经环境变量注入；**可以**创建用户 session               |
| `assistant/prompt.md` | 默认 Pi Assistant 的 system prompt                                                                                      |

内置 / 打包 Agent 的 meta 使用 `builtin`、`userSpawnable`（以及 `packagedKind` 等）。HTTP：禁止 PATCH/DELETE 内置 Agent 及其资源绑定；**允许** `PUT /agents/:id/system-md` 自定义 SYSTEM.md。打包 kinds：`shadow` / `btw`（不可用户建会话）、`intro` / `coding`（可用户建会话），另有「Pi 助手」。BTW 使用 packaged `btw` agent 的 SYSTEM.md（由 `btw/prompt.md` 种子写入），经 `POST /sessions/:id/btw` 创建，不经 members `tag=btw`。

---

## `prompts/` — 系统 Prompt 片段

`src/agent/system-prompts.ts` 在运行时加载这些片段并拼入 Agent 系统提示。

| 文件                         | 用途                            |
| ---------------------------- | ------------------------------- |
| `builtin-assistant-skill.md` | 描述 HTTP API 用法的 skill 片段 |
| `skills-preamble.md`         | Skills 区块前言                 |
| `context-file-section.md`    | 上下文文件说明段落              |
| `reading-strategy.md`        | 代码阅读策略提示                |

---

## `scripts/`

| 文件                          | 用途                                              |
| ----------------------------- | ------------------------------------------------- |
| `create-ask-test-session.ps1` | 本地创建带 ask 工具的测试 session（Windows 脚本） |

---

## `src/` — 运行时源码

### 顶层入口

| 文件       | 用途                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| `cli.ts`   | `pi-supervisor` 命令行：`serve`、扩展安装、provider 配置等                      |
| `index.ts` | 库入口：`startSupervisor()`、对外 re-export `SessionManager`、`SupervisorDb` 等 |
| `types.ts` | `Session`、`Provider`、`Agent` 等跨模块共享类型                                 |

---

### `src/agent/` — Agent 私有状态与内置 Agent

| 文件                   | 用途                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `index.ts`             | Agent 目录统一出口                                                                                      |
| `agent-paths.ts`       | Agent Home 路径与 `SYSTEM.md` 读写；Agent Home 不再保存 skills/extensions/prompts/tools                 |
| `builtin/index.ts`     | 内置 Agent 统一出口                                                                                     |
| `builtin/prompts.ts`   | 定位并加载随包 Agent prompt                                                                             |
| `builtin/registry.ts`  | 注册随包 Agent 和内置助手；`agents.is_internal` 控制是否允许建立用户 Session，内置 skill 通过数据库绑定 |
| `skills.ts`            | 解析和格式化 Skill                                                                                      |
| `skill-resource.ts`    | Skill 资源的发现、安装与卸载 Handler                                                                    |
| `prompt-templates.ts`  | 解析和展开 Prompt Template                                                                              |
| `prompt-resource.ts`   | Prompt 资源的发现、安装与卸载 Handler                                                                   |
| `system-prompts.ts`    | 加载随包系统提示片段                                                                                    |
| `context-files.ts`     | 收集工作区 `AGENTS.md` / `CLAUDE.md` 并拼入系统提示                                                     |
| `runtime-resources.ts` | 单个运行中 Agent 的 Skill、Prompt 与命令状态                                                            |
| `resource-resolver.ts` | 解析 Agent 已绑定资源、扩展工具与最终工具列表                                                           |

`src/testing/ai/` 通过 `pi-supervisor/test` 提供真实 Coding Agent 场景执行、裁判评分、A/B 比较与测试产物能力。公共 API 不依赖具体测试框架。

---

### `src/config/`

| 文件                    | 用途                                     |
| ----------------------- | ---------------------------------------- |
| `default-cwd.ts`        | 默认工作区路径的 get/set/resolve         |
| `built-in-providers.ts` | CLI 与后端初始化使用的内置 Provider 定义 |
| `resource-handlers.ts`  | 组合各领域提供的资源 Handler             |

---

### `src/core/` — Session 核心

| 文件                     | 用途                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `session-manager.ts`     | **中心协调器**：spawn、prompt、输入队列、状态、扩展、成员 agent       |
| `session-runtime.ts`     | **SessionRuntime**：单个 session 的 harness、prompt、abort 与工具挂载 |
| `session-lifecycle.ts`   | spawn、agent_end、完成阶段的 worktree、压缩和自动命名副作用           |
| `session-input-queue.ts` | 每 session 统一输入队列；`level >= 90` 打断当前轮次                   |
| `session-storage.ts`     | AgentHarness 与 SQLite 消息树的读写适配                               |
| `session-files.ts`       | `projects/<id>/sessions/<id>/` 目录布局                               |
| `session-history.ts`     | Session 消息分支、检查点创建与回退                                    |

#### `src/core/compaction/` — 上下文压缩

| 文件         | 用途                                      |
| ------------ | ----------------------------------------- |
| `rolling.ts` | 滚动压缩：`agent_end` 时按 token 阈值触发 |

---

### `src/db/` — 数据持久化

| 文件                | 用途                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `db.ts`             | **SupervisorDb**：projects、sessions、messages、agents（含 `is_internal`）、providers、members 的 CRUD |
| `message-search.ts` | 消息全文搜索（FTS）查询封装                                                                            |

数据库默认路径：`~/.pi/supervisor.db`（可通过 CLI `--db` 覆盖）。

---

### `src/extension/` — 扩展定义

| 文件           | 用途                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| `index.ts`     | `defineExtension()`、TypeBox 与扩展公共 API 导出                        |
| `loader.ts`    | 扩展入口解析、目录扫描与动态模块加载（jiti）                            |
| `installer.ts` | 解析 npm、Git、本地来源并安装或更新扩展                                 |
| `registry.ts`  | 进程级扩展模块缓存                                                      |
| `resource.ts`  | Extension 资源的发现、安装、更新及卸载 Handler                          |
| `types.ts`     | 扩展 API 类型：`ExtensionContext`、`ToolInfo`、`SpawnSessionRequest` 等 |
| `runtime/`     | Session 级扩展宿主、上下文适配、事件分发、工具策略与会话服务            |

### `src/resources/` — 通用资源框架

这里不实现任何具体资源类型，只提供统一机制。

| 文件                  | 用途                                                    |
| --------------------- | ------------------------------------------------------- |
| `handler.ts`          | 资源发现、安装、更新、卸载及解绑回调的通用 Handler 协议 |
| `resource-manager.ts` | 调度 Handler、维护数据库 catalog 与 Agent 资源绑定      |
| `resource-paths.ts`   | 通用全局资源根目录与安全的子目录解析                    |
| `catalog-sync.ts`     | 遍历已注册 Handler，将发现结果同步到数据库              |
| `types.ts`            | 通用资源及 Agent 资源绑定类型                           |

#### `src/extension/builtin/` — 内置扩展

| 目录或文件          | 用途                                                     |
| ------------------- | -------------------------------------------------------- |
| `shadow/`           | Shadow 分析、记忆与 XML 协议；不创建 session、不提供工具 |
| `subagent/index.ts` | 子 agent 扩展：spawn 子 session                          |
| `mcp/index.ts`      | MCP 内置扩展：连接绑定的 MCP 服务并注册扩展工具          |
| `mcp/resource.ts`   | MCP 配置资源的发现、安装与卸载 Handler                   |

用户安装的第三方扩展位于全局资源目录，由数据库记录 Agent binding。

---

### `src/extension/builtin/shadow/` — Shadow 协作者

普通 session 在 `agent_end` 后触发。每个 session 只有一个 Shadow，Shadow 直接执行一次 LLM
分析，不创建 session，也不具备工具。

| 文件          | 用途                                                           |
| ------------- | -------------------------------------------------------------- |
| `runner.ts`   | 执行 Shadow LLM 调用并处理输出                                 |
| `memory.ts`   | 读写 `<sessionDir>/shadow/shadow-memory.md` 与 lastEntry 指针  |
| `protocol.ts` | 构建提示并解析 memory、message、urgency、suggestion、title XML |
| `types.ts`    | Shadow 协议类型定义                                            |

有价值的 `message` 会注入主模型输入队列；常规轮次允许返回空。`suggestion` / 推荐问题经会话事件（SSE）投递给前端。

---

### Git 相关模块

| 文件                            | 用途                                         |
| ------------------------------- | -------------------------------------------- |
| `src/utils/git.ts`              | git 与 worktree 基础操作                     |
| `src/core/turn-file-tracker.ts` | 追踪每轮对话修改的文件（用于 commit 建议等） |

---

### `src/http/` — HTTP API

基于 [Hono](https://hono.dev/) 的 REST + SSE 接口，供 Web UI 与外部集成调用。

| 文件                 | 用途                                                        |
| -------------------- | ----------------------------------------------------------- |
| `http-server.ts`     | 路由定义：`/sessions`、`/prompt`、`/steer`、`/providers` 等 |
| `workspace-files.ts` | 工作区文件浏览 API                                          |

主要端点参见 `http-server.ts` 内注释；`POST /sessions/:id/prompt` 支持可选 `level` 字段，走统一输入队列。

---

### `src/extension/builtin/mcp/` — Model Context Protocol

| 文件        | 用途                         |
| ----------- | ---------------------------- |
| `index.ts`  | 内置扩展入口与数据库绑定加载 |
| `config.ts` | 从配置加载 MCP server 列表   |
| `client.ts` | 管理 MCP 客户端连接生命周期  |
| `tool.ts`   | MCP 扩展工具调用适配         |
| `types.ts`  | MCP 相关类型                 |

---

### `src/tools/` — 内置打包工具

通过 `loader.ts` 按 agent 配置激活，不再以独立 extension 包形式分发。

| 路径                            | 用途                                             |
| ------------------------------- | ------------------------------------------------ |
| `catalog.ts`                    | 打包工具 ID 列表与 `activatePackagedTool()` 分发 |
| `loader.ts`                     | 激活数据库中已绑定的内置工具                     |
| `index.ts`                      | tools 模块 re-export                             |
| `ask/tool.ts`                   | 向用户提问（阻塞等待回答）                       |
| `edit/tool.ts`                  | 文件编辑与审批接入                               |
| `edit/edit-approval.ts`         | 编辑审批流                                       |
| `lsp/tool.ts`                   | LSP 集成：跳转、重命名、诊断                     |
| `ast-grep/tool.ts`              | AST 模式搜索与改写                               |
| `web/web-search-tool.ts`        | DuckDuckGo 网页搜索                              |
| `web/web-fetch-tool.ts`         | 抓取 URL 内容                                    |
| `web/duckduckgo.ts`             | DuckDuckGo API 客户端                            |
| `web/html.ts`                   | HTML 正文提取                                    |
| `web/ssrf.ts`                   | SSRF 防护（内网地址拦截）                        |
| `browser/tool.ts`               | Puppeteer 浏览器自动化                           |
| `browser/launch.ts`             | 浏览器启动与可执行文件解析                       |
| `browser/registry.ts`           | 浏览器实例注册表                                 |
| `output-minimizer/hook.ts`      | 工具输出过大时的 hook                            |
| `output-minimizer/minimizer.ts` | 输出截断/摘要逻辑                                |

---

### `src/utils/`

| 文件                     | 用途                                             |
| ------------------------ | ------------------------------------------------ |
| `default-tools.ts`       | 创建默认 AgentTool 集合（bash、read 等基础工具） |
| `diagnostics.ts`         | 诊断信息收集                                     |
| `encrypt.ts`             | Provider API Key 加密存储                        |
| `event-bus.ts`           | 轻量事件总线                                     |
| `exec.ts`                | 子进程命令执行封装                               |
| `frontmatter.ts`         | Markdown YAML frontmatter 解析                   |
| `model-utils.ts`         | 模型解析与 provider 覆盖                         |
| `paths.ts`               | 路径规范化辅助                                   |
| `source-info.ts`         | 资源来源元数据（用于 UI 展示）                   |
| `supervisor-settings.ts` | 读取 supervisor 设置文件                         |
| `utility-llm.ts`         | 用小模型完成摘要等辅助 LLM 调用                  |

---

## `test/` — 测试

| 文件 / 目录                                           | 用途                                    |
| ----------------------------------------------------- | --------------------------------------- |
| `mock-agent-harness.ts`                               | Mock `AgentHarness`，隔离 LLM 依赖      |
| `session-manager.test.ts`                             | SessionManager CRUD、spawn、prompt      |
| `session-runtime.test.ts`                             | Runtime 包装与 shadow `send_parent_msg` |
| `session-input-queue.test.ts`                         | 输入队列排序与打断阈值                  |
| `session-input-manager.test.ts`                       | 队列 + agent_end drain + interrupt 集成 |
| `session-storage.test.ts`                             | SQLite 消息树读写                       |
| `session-checkpoint.test.ts`                          | 检查点与 rewind                         |
| `session-git-commit.test.ts`                          | 显式 commit 与 agent_end 行为           |
| `shadow-protocol.test.ts`                             | Shadow JSON 协议解析                    |
| `internal-agents.test.ts`                             | 内置 agent 注册                         |
| `http-server.test.ts`                                 | HTTP API 端到端                         |
| `web-ui-api.test.ts`                                  | Web UI 兼容 API 形状                    |
| `db.test.ts`                                          | 数据库层                                |
| `extension-*.test.ts`                                 | 扩展加载、API、事件、工具适配           |
| `builtin-lsp-tool.test.ts`                            | LSP 工具集成                            |
| `browser-extension.test.ts` / `web-extension.test.ts` | 浏览器与 Web 工具                       |
| `git-worktree.test.ts`                                | Git worktree                            |
| `turn-file-tracker.test.ts`                           | 轮次文件追踪                            |
| `integration/`                                        | 不调用真实模型的确定性集成测试          |
| `ai/*.ai.test.ts`                                     | Coding Agent 与裁判 LLM 效果测试        |
| `ai-testing.test.ts`                                  | 公共 AI 测试 API 的确定性测试           |

普通测试：`pnpm --filter pi-supervisor run test:unit`

AI 测试：`pnpm --filter pi-supervisor run test:ai`

---

## 关键数据流（简图）

```
CLI / HTTP
    │
    ▼
SessionManager ──► SessionInputQueue（统一输入队列）
    │                      │
    ├─► SessionRuntime ──► AgentHarness ──► LLM
    │         │
    │         └─► SessionExtensionHost ──► 扩展 / MCP / 打包工具
    │
    ├─► SupervisorDb (SQLite)
    │
    └─► agent_end ──► drain 队列 ──► Shadow LLM hook（不创建子 session）
```

---

## 运行时目录布局（磁盘）

与代码中 `session-files.ts`、`agent-paths.ts` 对应：

```
~/.pi/supervisor.db              # 全局数据库
~/.pi/supervisor/agents/<id>/    # Agent home（SYSTEM.md、skills、tools 标记）
~/.pi/supervisor/extensions/     # 全局扩展

<cwd>/.pi/supervisor/            # 项目级资源（可选）
<cwd>/.supervisor/projects/<pid>/sessions/<sid>/
    ├── shadow/shadow-memory.md  # Shadow 记忆（仅父 session）
    └── ...                      # 会话附件、日志等
```
