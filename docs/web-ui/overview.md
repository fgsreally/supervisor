# Web UI 概览

`@earendil-works/pi-supervisor-ui` 是 supervisor 的 Web 控制台。Vue 3 + Vite + Pinia + CodeMirror + Tailwind CSS。

## 技术栈

- **Vue 3**：Composition API + `<script setup>` + Vue Router
- **Vite 5**：构建 + HMR
- **Pinia**：全局状态管理
- **CodeMirror 6**：聊天输入框 + Agent 系统提示编辑器 + 资源浏览器
- **Tailwind CSS v4**：样式
- **lucide-vue-next**：图标
- **vue-tsc**：类型检查

## 入口流程

```
index.html
   │
   ▼
src/main.ts:1
   ├── 注册 router
   ├── 注册 pinia
   ├── 初始化主题（use-app-theme）
   └── 注册 PWA update handler
   │
   ▼
App.vue:1
   ├── ShellNav.vue（左边导航栏：Chat / Contacts / Providers / Resources / Search / Settings）
   ├── mainTab switch:
   │   ├── chat-tab → ChatListPanel + ChatView
   │   ├── contacts-tab → ContactDetailView
   │   ├── providers-tab → ProvidersPanel + ProviderDetailView
   │   ├── resources-tab → ResourceDetailView
   │   ├── search-tab → SearchView
   │   └── settings-tab → SettingsPanel
   └── Mobile 模式：底栏导航替代 ShellNav
```

## 主要功能

| 功能                                          | 实现状态             |
| --------------------------------------------- | -------------------- |
| 创建/删除/选择会话                            | 完成                 |
| Fork / Clone 会话                             | 完成                 |
| 发送消息（SSE 流式）                          | 完成                 |
| Ask-step（等待用户输入）                      | 完成                 |
| `@` 文件补全 + `/` skill/prompt 补全          | 完成                 |
| CodeMirror 代码编辑器（输入框 + 配置面板）    | 完成                 |
| Provider / Model 增删改                       | 完成                 |
| Agent 增删改 + SYSTEM.md 编辑                 | 完成                 |
| 全局资源浏览（skills / prompts / extensions） | 完成                 |
| 资源链接到 Agent                              | 完成                 |
| 会话 checkpoint / rewind / commit             | 完成                 |
| 会话日志查看（JSONL）                         | 完成                 |
| 搜索（全局搜索框）                            | 完成                 |
| 暗色主题                                      | 完成                 |
| 推送通知                                      | 完成（可设置 muted） |
| PWA                                           | 完成                 |
| **中止 / Steer / Follow-up**                  | **未实现**           |
| **Slash 命令执行**                            | **未实现**           |
| **Thinking Level 切换**                       | **未实现**           |
| **Extension 管理 UI**                         | **未实现**           |

## 组件统计

- 45+ 共享组件（`src/components/`）
- 13 个 chat 子组件（`src/components/chat/`）
- 4 个 Pinia stores
- 7 个路由 views
- 6 个 composables
- 21 个工具模块

## 进一步阅读

- [路由](/web-ui/routes)
- [Chat 子系统](/web-ui/chat)
- [Agent 配置](/web-ui/agents)
- [Provider 配置](/web-ui/providers)
- [资源管理](/web-ui/resources)
- [Pinia Stores](/web-ui/stores)
- [API 客户端](/web-ui/api-client)
- [已知未实装功能](/web-ui/known-gaps)
