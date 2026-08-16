# 路由

路由表由 `src/pages/` 经 `unplugin-vue-router` 生成。`src/router/index.ts` 只补重定向，并保留 `tabFromRoute` / `idFromRoute` / `modelIdFromRoute` 给壳使用。

| Path                                     | 作用                              |
| ---------------------------------------- | --------------------------------- |
| `/`                                      | 重定向到 `/chat`                  |
| `/home`                                  | 兼容旧链接，重定向到 `/dashboard` |
| `/active-ui`                             | 兼容旧链接，重定向到 `/chat`      |
| `/todo`                                  | Todo、计划与任务看板              |
| `/dashboard`                             | 工作分析与全局概览                |
| `/chat` / `/chat/:sessionId`             | 会话列表 + 对话                   |
| `/contacts` / `/contacts/:agentId`       | Agent 列表 / 详情                 |
| `/contacts/new`                          | 新建 Agent                        |
| `/providers` / `/providers/:providerId`  | Provider 列表 / 详情              |
| `/providers/new`                         | 新建 Provider                     |
| `/providers/:providerId/models/new`      | 新建模型                          |
| `/providers/:providerId/models/:modelId` | Provider 模型详情                 |
| `/resources` / `/resources/:resourceId`  | 资源列表 / 详情                   |
| `/settings`                              | 设置                              |
| `/settings/services`                     | 设置 · 服务                       |
| `/settings/diagnostics`                  | 设置 · 诊断                       |
| `/search`                                | 搜索页                            |

`App.vue` 只做壳与 `<RouterView>`。各页在 `src/pages/` 组装列表/详情；`useAppShell` 保存选中项并同步 URL。
