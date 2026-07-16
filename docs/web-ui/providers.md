# Provider 配置

## 页面

- `ProvidersPanel.vue`：Provider + Model 列表（左侧面板，路由 `providers-tab`）
- `ProviderDetailView.vue`：Provider 详情与 Model 管理（路由 `/providers/:providerId?`）
- `ProviderFormView.vue`：创建 / 编辑 Provider 表单（路由 `/providers/:providerId/edit`）

## 组件

| 组件                      | 作用                           |
| ------------------------- | ------------------------------ |
| `ProviderAvatar.vue`      | Provider 图标（支持 URL 图片） |
| `ProviderListItem.vue`    | Provider 列表项                |
| `ProviderModelEditor.vue` | Model 编辑                     |
| `ProviderModelTable.vue`  | Model 表格                     |
| `ModelMultimodalIcon.vue` | 多模态能力图标                 |
| `SessionAgentPicker.vue`  | 创建会话时选择 agent 的 picker |

## Store

`useProviderStore()`（`src/store/index.ts:515-687`）：

- `providers: Provider[]`
- `providerModels: Map<string, Model[]>` — 每个 provider 的 model 列表

Action：`fetchProviders`、`createProvider`、`updateProvider`、`deleteProvider`、`fetchProviderModels`、`createProviderModel`、`updateProviderModel`、`deleteProviderModel`

## 后端 Provider 值

Provider 可以配置 apiType（anthropic / openai / deepseek / google-genai / openai-compatible 等），由 DB provider 的 `baseUrl` / `apiType` 覆盖 AI SDK 中硬编码的 model 值。详见 `src/utils/model-utils.ts`。

## 备注

- `ProviderFormView.vue` 也用于其他角色（`mode = "edit" | "create"` 切换）
- Provider 名称支持 emoji 图标（存储在 `icon` 字段），也支持 URL 图片自动渲染
