# AI 代理协作规范

对本仓库（supervisor-standalone）贡献或进行开发时，AI 代理解读本文件以了解约定。

## 可编辑范围

只允许编辑以下包：

- `packages/supervisor` — 后端运行时（会话管理、HTTP API、扩展框架、MCP 集成）
- `packages/supervisor-web-ui` — Vue 3 + Vite 前端

根目录配置、文档（`docs/`）也在编辑范围内。

## 资源与产物目录

- 除非用户明确指定路径，否则不要把运行时资源、缓存、录制文件或其他产物写入工作目录。
- 资源或能力绑定到 Agent 时，产物写入该 Agent 的专属目录。
- 资源或能力绑定到 Project 时，产物写入该 Project 的专属目录。
- 资源或能力绑定到 Session、由 Session 调用或只服务于单次会话时，产物写入该 Session 的专属目录。
- 选择目录时遵循“最具体归属优先”：Session > Agent/Project；不得仅因工具拥有 `cwd` 就默认写入 `cwd`。

## 项目特征

- Node.js >= 20.6.0，ESM（type: "module"）
- 包管理器：pnpm（与 nub 兼容）
- 语法检查：oxlint / oxfmt（无 Prettier、无 Biome）
- 构建工具：tsdown（supervisor）、Vite（supervisor-web-ui）
- 测试框架：vitest、Playwright（E2E）

## 构建命令

```
pnpm install
pnpm run build
pnpm run check
pnpm run lint
pnpm run format:check
pnpm run test
pnpm docs:dev
pnpm docs:build
```

## UI 交互规范（web-ui）

引入 / 添加 / 修改 / 删除 等写操作必须遵循统一反馈，禁止 `window.alert` / `window.confirm`。

### 表单承载方式

- **轻量操作**（少量字段、短输入）：用弹窗 / 浮层即可。
- **重表单**（多项字段，或需要填写大段文本/长输入区）：使用独立路由页面或主内容区内容块，不要塞进小弹窗。

### 覆盖层 / 分屏表面（优先复用）

| 代号 | 场景 | PC | 移动端 | 封装 |
| ---- | ---- | -- | ------ | ---- |
| a | Session 内容区分屏（日志、文件树、工具详情、Todo、BTW、预览等） | 右侧分屏 | 自下而上抽屉 | `ResponsiveSplitSurface` |
| b | 内容较多的弹层（多段表单、列表、长内容仍需 overlay） | 居中弹窗 | 自下而上抽屉 | `ResponsiveDialog` |
| c | 内容较少的通知 / 确认 | 居中弹窗 | 居中弹窗 | `UiDialog` / `requestUiConfirm` |
| d | 删除确认 | 居中弹窗 | 居中弹窗 + 确认时马达震动 | `requestUiDeleteConfirm` |

删除确认禁止改用抽屉；统一走 `requestUiDeleteConfirm`（内部仍是 `UiConfirmHost` 居中弹窗，确认时调用 `hapticDelete`）。

### 反馈形态

| 场景                                   | Loading                                  | 成功 / 失败                     |
| -------------------------------------- | ---------------------------------------- | ------------------------------- |
| 通过按钮触发的创建 / 保存              | 按钮自身 loading（`UiActionButton`）     | `showUiMessage`                 |
| 非按钮触发（快捷键、拖放、自动提交等） | 全屏 busy（`withUiBusy` / `UiBusyHost`） | `showUiMessage`                 |
| 列表项上的逐条操作（如外部引入某一项） | 该项右侧 loading 图标（`UiListStatus`）  | 列表项勾 / 叉 + `showUiMessage` |
| 删除                                   | 先 `requestUiDeleteConfirm`（非原生 confirm） | `showUiMessage`            |

### 对应封装（优先复用）

- `showUiMessage` / `UiMessageHost` — 顶部轻提示
- `requestUiConfirm` / `UiConfirmHost` — 轻量确认框（c）
- `requestUiDeleteConfirm` — 删除确认（d，含 native 震动）
- `ResponsiveSplitSurface` — Session 分屏 / 移动抽屉（a）
- `ResponsiveDialog` — 重内容自适应弹层（b）
- `UiDialog` — 轻量居中弹窗（c）
- `withUiBusy` / `showUiBusy` / `UiBusyHost` — 全屏加载
- `UiActionButton` — 带 loading 的操作按钮
- `UiListStatus` — 列表项 loading / 成功勾 / 失败叉

新增写操作时，先套用以上组件与 composable，再考虑自定义 UI。

### 字号

全站 UI 文本使用封闭字号阶梯（`packages/supervisor-web-ui/src/styles/type-scale.css`），以 **rem** 定义语义 token，随根字号三档自动缩放。

| Token                    | 字号        | 字重  | 用途                         |
| ------------------------ | ----------- | ----- | ---------------------------- |
| `--app-font-page-title`  | `1.0625rem` | `600` | 页头主标题（如 Todo 品牌行） |
| `--app-font-title`       | `1rem`      | `600` | 区块标题                     |
| `--app-font-body-strong` | `0.9375rem` | `500` | 列表主文、摘要强调           |
| `--app-font-body`        | `0.875rem`  | `400` | 正文、输入、说明             |
| `--app-font-control`     | `0.8125rem` | `500` | 按钮、分段控件、表单项       |
| `--app-font-caption`     | `0.75rem`   | `400` | 次要 meta、分区标签          |
| `--app-font-micro`       | `0.6875rem` | `500` | 角标、极次要标记             |

字重只允许 `400` / `500` / `600` / `700`（`--app-font-weight-regular|medium|semibold|bold`）。

- **禁止**业务 UI 写约定外的 `px` / `text-[Npx]` 字号或字重；须用 `var(--app-font-*)`。
- 移动端列表 / 聊天等仍可用 `styles/mobile/typography.css` 的 `--m-font-*` 白名单；新增移动覆盖须与上表语义对齐。
- 全局档位：`html[data-font-scale=small|standard|large]`，根 rem 见 `styles/font-scale.css`（桌面 ≥768px：13/16/18px；移动：16/18/20px）。
- 入口：移动「我」页、PC「设置 → 界面」。

## Git 约定

- 不修改上游 `CHANGELOG.md`
- 无 emoji（禁止表情符号）
- 提交信息简明扼要
- `npm run check` 通过后方可提交

## Session / Project 的 `meta` 字段

- **`sessions.meta` 与 `projects.meta` 以扩展数据为主**（用户插件、Shadow 输出、`meta.services` 运行实例等）。
- 核心 UI / 身份字段用 **列**：`title`、`system_prompt`、`avatar`、`is_builtin`、`pinned`、`muted`、`unread`、`external_session_id`、`error_msg`、`stage`、`shadow_enabled`、`created_by`。
- 服务于 Session 的扩展状态存于 `sessions.meta`：`tasks` / `currentTask` / `todos`、`subagentIds`（可委派子 Agent）、Shadow 输出、`timers`（定时设定）等；Job **执行记录**仍用 `jobs` 平台表。
- Git / worktree 状态放在 **`sessions.meta.git`**：`{ worktreePath, branch, lastCommit, mergeError }`；有 `worktreePath` 即启用 worktree。
- 扩展自定义键请带前缀（如 `myExt.*`）。
- Agents 出厂标识用列 `spawn_type`（非 meta）；内置标志用 `is_builtin`。

### Git worktree 与 Achieve

- 创建 worktree：从 **`project.cwd` 当时 checkout 的分支** 切出；merge 目标**不**缓存在 session。
- Achieve / Complete：**始终 merge 进执行当下 `project.cwd` 的当前 checkout 分支**。
- 模型 / toolsPreset：只跟 **`agent_id` → agents 表**；`system_prompt` 列存本 session 运行时完整 system（不含 skills 目录、不含 servicesPrompt）。
- 需用户介入（未配模型、审批等）：`status = blocked`（不是 `error`）；原因写 **`error_msg`**（有则展示）。

## 沟通风格

- 简洁、精练
- 中文优先
- 引用源码时标注文件路径和行号
- 不在用户界面中展示底层实现流程、系统编排原理或面向开发者的流程说明；界面文案只表达用户当前可理解、可操作的内容。

## 移动端设计参考（微信）

移动端 UI 优先对齐微信官方设计与控件语言，实施时尽量查阅官方资料：

- WeUI：https://weui.io/
- WeUI GitHub：https://github.com/Tencent/weui
- 微信小程序设计指南：https://developers.weixin.qq.com/miniprogram/design/
- 微信开放社区设计相关文档：https://developers.weixin.qq.com/community/develop/doc

## 华生（助手模型）

- 设置页只配置一个**助手模型**（`featureModels.assistant`），不再按功能拆分模型。
- **华生**是内部 runner（`spawn_type: watson`）：`AgentHarness` + 简单工具（`createDefaultTools`）+ 助手模型；**不**再走 `pi-coding-agent` 的 `createAgentSession`（避免两套 agent 系统）。
- 不创建用户 session；任务提示词临时注入；结构化结果只用终止型 `submit_result` tool（pi 官方方式，无文本托底）。
- 入口：`SessionManager.runWatson` / 扩展 `ctx.watson.run(...)`；日志在 agent home `logs/`，Agent 详情 Logs 可见。
- 华生项目解析只把安装/启动/停止/销毁写进项目 `AGENTS.md`「本地开发服务」（不写入口 port/path）；Session 内 coding agent 确认实际入口后，通过 `ProjectServiceSetup` 登记到 `sessions.meta.services`（扁平 commands + `apps[{ name, port, path }]`），再按需启动/唤醒。
- Session 可委派子 Agent 白名单：`sessions.meta.subagentIds`（不再使用 `members` 表）。
