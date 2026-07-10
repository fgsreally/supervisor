# API 客户端

`src/api/api.ts`（882 行）是整个前端的数据层，封装了所有 HTTP API 调用。

## 导出函数

### Provider

| 函数 | 方法 + 路径 |
|---|---|
| `listProviders()` | `GET /providers` |
| `createProvider(data)` | `POST /providers` |
| `getProvider(id)` | `GET /providers/:id` |
| `updateProvider(id, data)` | `PATCH /providers/:id` |
| `deleteProvider(id)` | `DELETE /providers/:id` |

### Model

| 函数 | 方法 + 路径 |
|---|---|
| `listProviderModels(providerId)` | `GET /providers/:id/models` |
| `createProviderModel(providerId, data)` | `POST /providers/:id/models` |
| `updateProviderModel(providerId, modelId, data)` | `PATCH /providers/:id/models/:modelId` |
| `deleteProviderModel(providerId, modelId)` | `DELETE /providers/:id/models/:modelId` |

### Agent

| 函数 | 方法 + 路径 |
|---|---|
| `listAgents()` | `GET /agents` |
| `createAgent(data)` | `POST /agents` |
| `getAgent(id)` | `GET /agents/:id` |
| `updateAgent(id, data)` | `PATCH /agents/:id` |
| `deleteAgent(id)` | `DELETE /agents/:id` |
| `getAgentResources(id)` | `GET /agents/:id/resources` |
| `getAgentSystemMd(id)` | `GET /agents/:id/system-md` |
| `linkAgentResource(agentId, resourceId)` | `POST /agents/:id/resources/link` |

### Session

| 函数 | 方法 + 路径 |
|---|---|
| `listSessions()` | `GET /sessions` |
| `getSession(id)` | `GET /sessions/:id` |
| `createSession(data)` | `POST /sessions` |
| `deleteSession(id)` | `DELETE /sessions/:id` |
| `promptSession(id, data)` | `POST /sessions/:id/prompt`（SSE）|
| `forkSession(id)` | `POST /sessions/:id/fork` |
| `cloneSession(id)` | `POST /sessions/:id/clone` |
| `killSession(id)` | `POST /sessions/:id/kill` |
| `completeSession(id)` | `POST /sessions/:id/complete` |
| `getSessionState(id)` | `GET /sessions/:id/state` |
| `getSessionTree(id)` | `GET /sessions/:id/tree` |
| `getSessionLog(id)` | `GET /sessions/:id/log` |
| `createCheckpoint(id, label?)` | `POST /sessions/:id/checkpoint` |
| `listCheckpoints(id)` | `GET /sessions/:id/checkpoints` |
| `commitSession(id, msg?)` | `POST /sessions/:id/commit` |
| `getSessionCommands(id)` | `GET /sessions/:id/commands` |

### Other

| 函数 | 方法 + 路径 |
|---|---|
| `getFileContent(path)` | `GET /files/content?path=<path>` |
| `listWorkspaceFiles(dir)` | `GET /workspace/files?dir=<dir>` |
| `getGlobalResources()` | `GET /resources/global` |

## 未导出但存在

- `setAgentSystemMd` 不在 api.ts 中导出（store 封装的 `updateAgentSystemMd`）

## 备注

- `promptSession` 返回一个 `EventSource`/`ReadableStream`，由 store 中的 `readSSE` 逻辑处理
- 所有函数返回 `Promise<ApiResponse<T>>`，错误由 store 层捕获
