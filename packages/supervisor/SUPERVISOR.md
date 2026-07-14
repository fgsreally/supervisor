# pi-supervisor 包结构与文件说明

`@earendil-works/pi-supervisor` 是多会话 AI Agent 编排运行时：管理 session 生命周期、SQLite 持久化、HTTP API、扩展框架、内置工具与 Shadow 协作者。

入口：`cli.ts`（`pi-supervisor` 命令）或 `index.ts` 的 `startSupervisor()`。

---

## 文件树

```
packages/supervisor/
├── agents/                          # 内置 agent 的 prompt 模板
│   ├── shadow/prompt.md
│   └── intro/prompt.md
├── prompts/                         # 随包分发的系统 prompt 片段
├── scripts/                         # 开发/调试脚本
├── src/                             # 运行时源码
│   ├── agent/                       # Agent 资源、技能、扩展安装
│   ├── config/                      # 全局配置
│   ├── core/                        # Session 核心（管理器、运行时、队列、压缩）
│   ├── db/                          # SQLite 数据层
│   ├── extension/                   # 扩展框架 + 内置扩展
│   ├── git/                         # Git worktree 与轮次文件追踪
│   ├── http/                        # HTTP API（Hono）
│   ├── shadow/                      # Shadow 协作者 hook
│   ├── spawn/                       # 子 session 创建
│   ├── resources/                   # 资源目录、绑定、加载与 pi-supervisor:// 协议
│   ├── tools/                       # 内置打包工具（edit、lsp、web 等）
│   ├── utils/                       # 通用工具函数
│   ├── cli.ts                       # CLI 入口
│   ├── index.ts                     # 库入口与 re-export
│   ├── session-lifecycle.ts         # agent_end 等生命周期副作用
│   └── types.ts                     # 共享类型定义
├── test/                            # 单元测试与集成测试
├── .env.example                     # 环境变量示例
├── package.json
├── tsconfig.build.json
├── tsdown.config.ts                 # 构建配置
├── vitest.config.ts
├── SUPERVISOR.md                    # 本文件
└── SUPERVISOR_VS_CODING_AGENT_FEATURE_DIFF.md  # 与 coding-agent 功能对比
```

---

## 根目录

| 文件                                         | 用途                                  |
| -------------------------------------------- | ------------------------------------- |
| `package.json`                               | 包元数据、依赖、`build` / `test` 脚本 |
| `tsdown.config.ts`                           | 用 tsdown 将 `src/` 编译到 `dist/`    |
| `tsconfig.build.json`                        | 构建用 TypeScript 配置                |
| `vitest.config.ts`                           | 测试运行配置                          |
| `.env.example`                               | 可选环境变量说明（API Key 等）        |
| `SUPERVISOR_VS_CODING_AGENT_FEATURE_DIFF.md` | 与 `pi-coding-agent` 的能力差异说明   |

---

## `agents/` — 内置 Agent

随包安装的内置 agent prompt。启动时由 `src/agent/builtin/index.ts` 写入 agent home 的 `SYSTEM.md`。

| 文件                  | 用途                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `shadow/prompt.md`    | Shadow 协作者（`is_internal`）：每轮主对话结束后分析记忆与安全，按需向父 session 投递消息；**不可**用于创建用户 session |
| `intro/prompt.md`     | Intro 引导和扩展开发助手，使用 coding 工具；**可以**创建用户 session                                                    |
| `assistant/prompt.md` | 默认 Pi Assistant 的 system prompt                                                                                      |

内置 Agent 的 meta 只使用 `builtin` 和 `userSpawnable` 两个布尔字段。HTTP API 不允许修改、删除内置 Agent，也不允许改写其 system prompt 或资源绑定。

---

## `prompts/` — 系统 Prompt 片段

`system-prompts.ts` 在运行时加载，拼入 assistant 系统提示。

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

| 文件                   | 用途                                                                            |
| ---------------------- | ------------------------------------------------------------------------------- |
| `cli.ts`               | `pi-supervisor` 命令行：`serve`、扩展安装、provider 配置等                      |
| `index.ts`             | 库入口：`startSupervisor()`、对外 re-export `SessionManager`、`SupervisorDb` 等 |
| `types.ts`             | `Session`、`Provider`、`Agent` 等跨模块共享类型                                 |
| `session-lifecycle.ts` | `agent_end` 触发的副作用：git worktree、滚动压缩、自动命名等                    |

---

### `src/agent/` — Agent 私有状态与内置 Agent

| 文件                  | 用途                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `index.ts`            | Agent 目录统一出口                                                                                      |
| `agent-paths.ts`      | Agent Home 路径与 `SYSTEM.md` 读写；Agent Home 不再保存 skills/extensions/prompts/tools                 |
| `builtin/index.ts`    | 内置 Agent 统一出口                                                                                     |
| `builtin/prompts.ts`  | 定位并加载随包 Agent prompt                                                                             |
| `builtin/registry.ts` | 注册随包 Agent 和内置助手；`agents.is_internal` 控制是否允许建立用户 Session，内置 skill 通过数据库绑定 |

---

### `src/config/`

| 文件             | 用途                             |
| ---------------- | -------------------------------- |
| `default-cwd.ts` | 默认工作区路径的 get/set/resolve |

---

### `src/core/` — Session 核心

| 文件                     | 用途                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `session-manager.ts`     | **中心协调器**：spawn、prompt、输入队列、状态、扩展、成员 agent       |
| `session-runtime.ts`     | **SessionRuntime**：单个 session 的 harness、prompt、abort 与工具挂载 |
| `session-extension/`     | 扩展宿主、上下文适配、事件分发、工具注册与会话服务                    |
| `session-input-queue.ts` | 每 session 统一输入队列；`level >= 90` 打断当前轮次                   |
| `session-storage.ts`     | AgentHarness 与 SQLite 消息树的读写适配                               |
| `session-files.ts`       | `projects/<id>/sessions/<id>/` 目录布局                               |
| `session-branch.ts`      | Session 分支类型（main / fork 等）                                    |
| `session-checkpoint.ts`  | 对话检查点创建与回退                                                  |
| `session-git-hooks.ts`   | Session 自动命名、git 元数据更新                                      |
| `context-files.ts`       | 从工作区收集 `AGENTS.md` / `CLAUDE.md` 并拼入系统提示                 |

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

| 文件        | 用途                                                                    |
| ----------- | ----------------------------------------------------------------------- |
| `index.ts`  | `defineExtension()`、TypeBox 与扩展公共 API 导出                        |
| `loader.ts` | 扩展入口解析、目录扫描与动态模块加载（jiti）                            |
| `types.ts`  | 扩展 API 类型：`ExtensionContext`、`ToolInfo`、`SpawnSessionRequest` 等 |

### `src/resources/` — 资源目录与数据库绑定

| 文件                     | 用途                                                   |
| ------------------------ | ------------------------------------------------------ |
| `resource-manager.ts`    | 安装、卸载、查询资源，以及创建/删除 Agent 的数据库绑定 |
| `extension-installer.ts` | 解析 npm、Git、本地来源并安装扩展                      |
| `resource-paths.ts`      | 全局资源目录布局                                       |
| `agent-resources.ts`     | 汇总 Agent 已绑定资源、探测扩展工具与最终工具列表      |
| `agent-resource.ts`      | Session 运行时加载 skill、prompt、MCP 并负责清理       |
| `skills.ts`              | 解析和格式化 skill                                     |
| `prompt-templates.ts`    | 解析和展开 prompt 模板                                 |
| `system-prompts.ts`      | 加载随包系统提示模板                                   |
| `catalog-sync.ts`        | 把全局资源目录同步到数据库 catalog                     |

### `src/providers/`

`built-in-providers.ts` 保存 CLI 使用的内置 Provider 定义。

#### `src/extension/builtin/` — 内置扩展

| 文件                    | 用途                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `shadow-agent/index.ts` | Shadow 子 session 扩展：提供 `send_parent_msg` 工具         |
| `subagent/index.ts`     | 子 agent 扩展：spawn 子 session、读 `pi-supervisor://` 资源 |
| `mcp/index.ts`          | MCP 内置扩展：连接绑定的 MCP 服务并注册扩展工具             |

用户安装的第三方扩展位于全局资源目录，由数据库记录 Agent binding。

---

### `src/shadow/` — Shadow 协作者

仅**父 session**（无 `parentId`、非 builtin）在 `agent_end` 后触发。

| 文件          | 用途                                                        |
| ------------- | ----------------------------------------------------------- |
| `hook.ts`     | `runShadowHook()`：spawn/复用 shadow 子 session，跑一轮分析 |
| `memory.ts`   | 读写 `<sessionDir>/shadow/memory.md` 与 lastEntry 指针      |
| `protocol.ts` | 解析 shadow 输出的 JSON 协议（memory / security / parent）  |
| `types.ts`    | Shadow 协议类型定义                                         |

Shadow 向父 session 投递消息时走 `SessionManager.submitSessionInput()`，与统一输入队列合并。

---

### `src/spawn/` — 子 Session 创建

| 文件                           | 用途                                             |
| ------------------------------ | ------------------------------------------------ |
| `session-spawner.ts`           | 创建子 session：继承 cwd、agent、git worktree 等 |
| `spawn-agent-tool-provider.ts` | 为 spawn 工具提供 agent 列表                     |

---

### `src/git/`

| 文件                   | 用途                                             |
| ---------------------- | ------------------------------------------------ |
| `git-worktree.ts`      | 为 session 创建独立 git worktree、合并分支、清理 |
| `turn-file-tracker.ts` | 追踪每轮对话修改的文件（用于 commit 建议等）     |

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

### `src/resources/protocol/` — `pi-supervisor://` 资源

供子 agent / 扩展读取 session 消息、agent skills 等。

| 文件       | 用途                                   |
| ---------- | -------------------------------------- |
| `url.ts`   | 资源 scheme、URL 构造与解析            |
| `list.ts`  | 列出某 session / agent 下可用资源      |
| `read.ts`  | 读取资源内容（消息、skill、prompt 等） |
| `index.ts` | 模块 re-export                         |

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
| `resource-protocol.test.ts`                           | 资源 URL 读写                           |
| `integration/`                                        | 需真实环境的集成测试（默认 skip）       |
| `integration/helpers.ts`                              | 集成测试共用 fixture                    |

运行：`pnpm --filter @earendil-works/pi-supervisor test`

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
    └─► agent_end ──► drain 队列 ──► runShadowHook ──► shadow 子 session
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
    ├── shadow/memory.md         # Shadow 记忆（仅父 session）
    └── ...                      # 会话附件、日志等
```
