# Pi Supervisor Web UI

Vue 3 + Vite 前端，连接 `pi-supervisor` HTTP API，提供聊天、Agent 管理、全局资源库等功能。

## 开发

仓库根目录两个终端分别起后端与 Vite（无需先 build）：

```bash
pnpm run dev:server
pnpm run dev:web
```

- API：`http://localhost:3042`（Node 直接跑源码）
- UI：`http://localhost:5163`（Vite，API 代理到 3042）
- 开发暂用 `--cwd playground`：db / public / agents / projects 都在 `playground/`
- 终端二维码指向局域网 Vite 地址（如 `http://192.168.x.x:5163`）

手机同 WiFi 扫终端二维码，或访问 `http://{局域网IP}:5163`。

生产单端口 / 隧道：

```bash
pnpm run serve:tunnel   # 构建产物 + Cloudflare，QR 为 CF URL
pnpm run serve          # 后端 +（若有）UI dist；同样 --cwd playground
```

## 聊天 UI 组件映射

微调聊天界面时，优先改对应组件，避免直接改 `ChatView.vue` 大文件。

| 区域               | 组件路径                                        | 说明                                   |
| ------------------ | ----------------------------------------------- | -------------------------------------- |
| 聊天页容器         | `src/views/ChatView.vue`                        | 会话状态、SSE 流、输入框编排           |
| 聊天顶栏           | `src/components/chat/ChatViewHeader.vue`        | 标题、Agent 链接、状态、菜单           |
| 聊天内搜索         | `src/components/chat/ChatSearchBar.vue`         | 消息全文搜索条                         |
| 消息列表           | `src/components/chat/ChatMessageList.vue`       | 滚动区、分支分隔、系统/压缩条          |
| **用户气泡**       | `src/components/chat/UserMessageRow.vue`        | 用户消息、文件气泡、时间戳             |
| **AI 气泡**        | `src/components/chat/AssistantMessageGroup.vue` | 助手消息组：思考、Markdown、工具       |
| **工具渲染分发**   | `src/components/chat/ToolStepRenderer.vue`      | 按工具类型路由到具体渲染器             |
| ask 工具（选择题） | `src/components/chat/AskStep.vue`               | 执行中：选项列表；完成后：仅显示选中项 |
| ask 选项按钮       | `src/components/chat/AskStepOption.vue`         | 单个选择题选项样式                     |
| bash 工具          | `src/components/BashStep.vue`                   | 终端命令步骤                           |
| 通用工具条         | `src/components/ToolActivityBar.vue`            | read/write/spawn 等默认工具 UI         |
| 思考块             | `src/components/ThinkingBlock.vue`              | 可折叠思考过程（偏好存 localStorage）  |
| Markdown 正文      | `src/components/MarkdownContent.vue`            | AI 文本 Markdown 渲染                  |
| 用户富文本         | `src/components/ChatRichText.vue`               | 用户消息内联格式                       |
| 压缩横幅           | `src/components/CompactionBanner.vue`           | 上下文压缩条目                         |
| 输入框             | `src/components/ChatInputPanel.vue`             | `@` 文件、`/` skill/prompt、图片粘贴   |
| **左侧会话行**     | `src/components/SessionListItem.vue`            | 单个会话：头像、预览、未读             |
| 会话子树           | `src/components/SessionListSubtree.vue`         | 子会话缩进树                           |
| 会话列表面板       | `src/components/ChatListPanel.vue`              | 置顶区 + 工作区分组列表                |

### ask 工具

- 后端：`packages/supervisor/src/tools/ask/`，工具名 `ask`
- 提交答案：`POST /sessions/:id/ask-answer`
- 前端解析：`src/utils/ask-tool.ts`
- 兼容工具名：`ask`、`questionnaire`、`AskUserQuestion`

### 内置 Pi 助手

- Agent 名称：**Pi 助手**（`meta.builtin` + `meta.userSpawnable`；数据库自增 id，非固定字符串）
- 置顶会话：`meta.pinned` + `meta.builtin`
- 启动 supervisor 时自动创建；自带 `supervisor-guide` skill 与系统提示
- 用途：Supervisor 配置、插件迁移、skill 安装、使用答疑
- 会话列表未读角标：`meta.unread`（打开会话时清零）

## PWA 与推送

- 构建时通过 `vite-plugin-pwa` 生成 Service Worker，可安装到桌面（不做资源缓存）
- 消息流完成且页面在后台时，通过浏览器 `Notification` API 推送（需用户授权）
- 逻辑：`src/composables/use-push-notifications.ts`
- 静音会话（`meta.muted`）不推送

## 全局资源

- 默认全局根：`~/.supervisor`；开发时 `--cwd playground`
- 其下：`global/{skills,extensions,prompts}`、`agents/`、`public/`、`supervisor.db`

## 检查

```bash
npm run check   # vue-tsc
npm run build   # 生产构建（含 PWA）
```
