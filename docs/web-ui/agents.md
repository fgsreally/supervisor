# Agent 配置

## 页面

- `ContactDetailView.vue`：Agent 详情页（路由 `/contacts/:agentId?`）
- `AgentFormView.vue`：创建 / 编辑 Agent 表单（路由 `/contacts/:agentId/edit`）

## 组件

| 组件 | 作用 |
|---|---|
| `AgentConfigPanel.vue` | 核心配置面板：name、description、homeDir、provider、model、toolsPreset |
| `AgentListItem.vue` | Agent 列表项，显示 avatar + preset chip |
| `AgentResourceBrowser.vue` | Agent 资源浏览器：skills / prompts / extensions 树 + 文件内容编辑 |
| `AgentSystemPromptPanel.vue` | SYSTEM.md 编辑器（CodeMirror + 预览切换） |

## Store

`useAgentStore()`（`src/store/index.ts:329-511`）：

- `agents: Agent[]`
- `agentResources: Map<string, AgentResource>` — 当前 agent 的资源
- `systemMd: string`

Action：`fetchAgent`、`createAgent`、`updateAgent`、`deleteAgent`、`fetchAgentResources`、`linkAgentResource`、`fetchAgentSystemMd`、`updateAgentSystemMd`

## API

`api/api.ts` 对应端点：

- `GET /agents/:id` → 获取 agent
- `GET /agents/:id/resources` → agent 资源
- `GET /agents/:id/system-md` → SYSTEM.md
- `PATCH /agents/:id` → 更新 agent
- `POST /agents/:id/resources/link` → 链接全局资源
