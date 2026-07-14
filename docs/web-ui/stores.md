# Pinia Stores

所有 store 定义在 `src/store/index.ts`。（注意还有一个 `src/store/session.ts`，但那个是 deprecated shim。）

## Store 清单

### useRootStore（`store/index.ts:41-67`）

```ts
interface RootState {
  isLoading: boolean;
  globalError: string | null;
}
```

各 view 在加载时调用 `setLoading(true/false)`。全局错误显示在 App shell 层面。

### useSessionStore（`store/index.ts:71-325`）

核心 store，最复杂：

**State**：

- `sessions: Session[]`
- `messages: SessionMessageResponse[]`
- `currentSessionId: string | null`
- `currentCheckpoints: SessionCheckpoint[]`
- `groupedSessions`（按 workspace 分组的 getter）

**Actions**：

- `fetchSessions()` / `fetchSession(id)` / `fetchSessionTree(id)`
- `createSession(opts)` / `deleteSession(id)`
- `promptSession(id, msg)` — **核心**，启动 SSE
- `forkSession(id)` / `cloneSession(id)`
- `killSession(id)` / `completeSession(id)`
- `createCheckpoint(id)` / `listCheckpoints(id)` / `rewindSession(id, checkpointId)`
- `commitSession(id)`
- `getSessionLog(id)`

**SSE 流处理**：`promptSession` 内部建立一个 SSE reader，逐条解析事件（`/events` streaming event），更新 messages 树。

### useAgentStore（`store/index.ts:329-511`）

**State**：

- `agents: Agent[]`
- `agentResources: Map<string, AgentResource>`

**Actions**：fetch / create / update / delete agent，fetch / update systemMd，bind resource。

### useProviderStore（`store/index.ts:515-687`）

**State**：

- `providers: Provider[]`
- `providerModels: Map<string, Model[]>`

**Actions**：provider + model 完整 CRUD。

### useResourceStore（`store/index.ts:691-753`）

**State**：

- `globalSkills / globalPrompts / globalExtensions: ResourceFile[]`
- `resourceItems: AgentResource[]`

**Actions**：`fetchGlobalResources()`、`linkResource()`。

## 已弃用 Store

`src/store/session.ts`：标 `@deprecated`。抽出了 `useRootStore` 和 `useSessionStore` 后留下的 shim。不要使用。
