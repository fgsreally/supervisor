# Pinia Stores

所有 store 定义在 `src/store/index.ts`。（注意还有一个 `src/store/session.ts`，但那个是 deprecated shim。）

## Store 清单

### useRootStore

统一保存各业务域的 loading 状态和全局错误。

### useSessionStore

核心 store，最复杂：

**State**：

- `sessions: Session[]`
- `projects: Project[]`
- `currentSessionId: string | null`
- `messages: Record<string, SessionTreeEntry[]>`
- `groupedSessions`（按 workspace 分组的 getter）

**Actions**：

- `fetchProjects()` / `createProject(opts)`
- `fetchSessions()` / `fetchSession(id)`
- `createSession(opts)` / `deleteSession(id)`
- `fetchSessionMessages(id)` / `sendPrompt(id, message)`
- `forkSession(id)` / `cloneSession(id)`
- `killSession(id)` / `completeSession(id)`
- `createCheckpoint(id)` / `listCheckpoints(id)` / `rewindSession(id, checkpointId)`
- `commitSession(id)`
- `createBtwSession(id)` / `updateSessionMeta(id, patch)`

实时 SSE 与流式消息合并主要由 `ChatView` 和 `src/api` 负责，store 保存服务端会话快照。

### useAgentStore

**State**：

- `agents: Agent[]`
- `agentResources: Map<string, AgentResource>`

**Actions**：fetch / create / update / delete agent，fetch / update systemMd，bind resource。

### useProviderStore

**State**：

- `providers: Provider[]`
- `providerModels: Map<string, Model[]>`

**Actions**：provider + model 完整 CRUD。

### useResourceStore

**State**：

- `globalResources: ResourceLayer | null`
- `currentCwd: string`
- `resourceItems: AgentResource[]`

**Actions**：`fetchGlobalResources()`、`setCwd()`。

## 已弃用 Store

`src/store/session.ts`：标 `@deprecated`。抽出了 `useRootStore` 和 `useSessionStore` 后留下的 shim。不要使用。
