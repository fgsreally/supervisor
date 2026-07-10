# 路由

`src/router/index.ts:18-29` 定义的路由：

| Path | 组件前缀 | 作用 |
|---|---|---|
| `/chat/:sessionId?` | `App.vue` 的 `chat-tab` | 会话列表 + 对话窗口 |
| `/contacts/:agentId?` | `contacts-tab` | Agent 详情 |
| `/providers/:providerId?` | `providers-tab` | Provider 详情 |
| `/resources/:resourceId?` | `resources-tab` | 资源详情 |
| `/search` | `search-tab` | 全局搜索 |
| `/settings` | `settings-tab` | 设置面板 |
| `/` | → 重定向到 `/chat` | |

路由本身很小（7 个 stub），实际视图切换由 `App.vue:8-92` 的 `mainTab` 控制。路由参数只是让 URL 可分享。
