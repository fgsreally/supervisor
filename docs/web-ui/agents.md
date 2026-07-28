# Agent 配置

## 页面

- `ContactDetailView.vue`：Agent 详情页（路由 `/contacts/:agentId?`）
- `AgentFormView.vue`：由 `App.vue` 在创建或编辑状态下切换，不使用独立 `/edit` 路由

## 组件

| 组件                         | 作用                                                                   |
| ---------------------------- | ---------------------------------------------------------------------- |
| `AgentConfigPanel.vue`       | 核心配置面板：name、description、homeDir、provider、model、toolsPreset |
| `AgentListItem.vue`          | Agent 列表项，显示 avatar + preset chip                                |
| `AgentResourceBrowser.vue`   | Agent 资源浏览器：skills / prompts / extensions 树 + 文件内容编辑      |
| `AgentSystemPromptPanel.vue` | system prompt 编辑器（CodeMirror + 预览切换）                          |

## Store

`useAgentStore()`（`src/store/index.ts`）：

- `agents: Agent[]`
- `agentResources: Map<string, AgentResource>` — 当前 agent 的资源
- `systemMd: string`

Action：`fetchAgent`、`createAgent`、`updateAgent`、`deleteAgent`、`fetchAgentResources`、`bindAgentResource`、`fetchAgentSystemMd`、`updateAgentSystemMd`

## API

`api/api.ts` 对应端点：

- `GET /agents/:id` → 获取 agent
- `GET /agents/:id/resources` → agent 资源
- `GET /agents/:id/system-md` → 读取 `agents.system_prompt`（端点名为兼容命名）
- `PUT /agents/:id/system-md` → 写入 `agents.system_prompt`（内置 Agent 也可改）
- `PATCH /agents/:id` → 更新 agent（内置 Agent 禁止）
- `POST /agents/:id/resources` → 绑定 catalog 资源（内置 Agent 禁止）
- `DELETE /agents/:id/resources/:resourceId` → 删除资源绑定（内置 Agent 禁止）

`agents.system_prompt` 是权威来源。运行时不从 Agent Home 的 `SYSTEM.md` 反向覆盖数据库；
Session 创建时把完整运行时 system 快照写入 `sessions.system_prompt`。
