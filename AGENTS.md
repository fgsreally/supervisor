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

### 反馈形态

| 场景 | Loading | 成功 / 失败 |
| --- | --- | --- |
| 通过按钮触发的创建 / 保存 | 按钮自身 loading（`UiActionButton`） | `showUiMessage` |
| 非按钮触发（快捷键、拖放、自动提交等） | 全屏 busy（`withUiBusy` / `UiBusyHost`） | `showUiMessage` |
| 列表项上的逐条操作（如外部引入某一项） | 该项右侧 loading 图标（`UiListStatus`） | 列表项勾 / 叉 + `showUiMessage` |
| 删除 | 先 `requestUiConfirm`（非原生 confirm） | `showUiMessage` |

### 对应封装（优先复用）

- `showUiMessage` / `UiMessageHost` — 顶部轻提示
- `requestUiConfirm` / `UiConfirmHost` — 确认框
- `withUiBusy` / `showUiBusy` / `UiBusyHost` — 全屏加载
- `UiActionButton` — 带 loading 的操作按钮
- `UiListStatus` — 列表项 loading / 成功勾 / 失败叉

新增写操作时，先套用以上组件与 composable，再考虑自定义 UI。

## Git 约定

- 不修改上游 `CHANGELOG.md`
- 无 emoji（禁止表情符号）
- 提交信息简明扼要
- `npm run check` 通过后方可提交

## 沟通风格

- 简洁、精练
- 中文优先
- 引用源码时标注文件路径和行号
