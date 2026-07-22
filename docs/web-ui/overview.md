# Web UI 概览

`pi-supervisor-ui` 是 supervisor 的 Web 控制台。Vue 3 + Vite + Pinia + CodeMirror + Tailwind CSS。

## 技术栈

- **Vue 3**：Composition API + `<script setup>` + Vue Router
- **Vite**：构建 + HMR
- **Pinia**：全局状态
- **CodeMirror 6**：聊天输入与配置编辑
- **Tailwind CSS**：样式
- **lucide-vue-next**：图标

## 入口流程

```
index.html → src/main.ts → App.vue
  ├── ShellNav（Chat / Contacts / Providers / Resources / Settings）
  ├── mainTab 切换对应面板
  └── Mobile：底栏导航
```

路由见 [路由](/web-ui/routes)。`/search` 重定向到 `/chat`。

## 主要功能

| 功能                                | 状态               |
| ----------------------------------- | ------------------ |
| 创建/删除/选择会话                  | 完成               |
| Fork / Clone / BTW                  | 完成               |
| 发送消息（SSE）                     | 完成               |
| Steer / Follow-up（运行中发送模式） | 完成               |
| Slash 命令（`/` + `commands` API）  | 完成               |
| Ask-step                            | 完成               |
| `@` 文件补全 + skill/prompt 补全    | 完成               |
| Provider / Agent / 资源管理         | 完成               |
| Checkpoint / Rewind / Commit        | 完成               |
| Job Popover 与长输出分屏            | 完成               |
| Workflow stage 标签                 | 完成（面板见缺口） |
| Shadow 消息行与启用开关             | 完成               |
| 暗色主题 / 推送 / PWA               | 完成               |
| 运行中停止与未回答消息回填          | 完成               |
| Thinking Level 切换                 | 未实现             |
| 扩展管理 UI                         | 未实现             |

## 进一步阅读

- [路由](/web-ui/routes)
- [Chat 子系统](/web-ui/chat)
- [Agent 配置](/web-ui/agents)
- [Provider 配置](/web-ui/providers)
- [资源管理](/web-ui/resources)
- [Pinia Stores](/web-ui/stores)
- [已知缺口](/web-ui/known-gaps)
