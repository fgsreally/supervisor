# 路由

`src/router/index.ts` 定义的路由：

| Path | 作用 |
|------|------|
| `/` | 重定向到 `/chat` |
| `/chat/:sessionId?` | 会话列表 + 对话 |
| `/contacts/:agentId?` | Agent 详情 |
| `/providers/:providerId?` | Provider 详情 |
| `/providers/:providerId/models/:modelId` | Provider 模型详情 |
| `/resources/:resourceId?` | 资源详情 |
| `/settings` | 设置 |
| `/search` | **重定向到 `/chat`**（无独立 Search 页） |

视图切换主要由 `App.vue` 的 `mainTab`（由路径推导）控制；路由参数用于可分享 URL。
