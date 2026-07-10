# 会话管理

会话（Session）是 supervisor 的核心单位。一个会话对应一个 agent harness 实例 + 一棵消息树 + 一个 SQLite 行。

## 数据模型

类型定义在 `src/types.ts`：

```ts
interface Session {
  id: string;
  parentId: string | null;       // 分支时记录父会话
  sessionId: string | null;     // 外部 stable id
  pid: number | null;            // 子进程 PID（如有）
  status: "starting" | "running" | "waiting_user" | "idle" | "finish" | "error" | "stopped";
  cwd: string;                  // 会话工作目录
  leafId: string | null;        // 当前消息树叶子节点 id
  agentId: string | null;
  branchType: "spawn" | "fork" | "clone" | null;
  createdAt: Date;
  lastActiveAt: Date;
  meta: Record<string, unknown>;
}
```

## 生命周期

`src/core/session-manager.ts:371` 提供：

| 方法 | 说明 |
|---|---|
| `createSession(opts)` | 创建会话（分配 id、agent、cwd） |
| `spawnSession(opts)` | 创建并立即启动一个子进程会话（带 systemPrompt + instructions） |
| `kill(sessionId)` | 终止会话进程 |
| `complete(sessionId)` | 标记会话完成 |
| `prompt(sessionId, msg)` | 发送用户消息，触发 agent |
| `fork(sessionId)` | 从叶子分支（保留原会话）|
| `clone(sessionId)` | 完整克隆消息树 |
| `getTree(sessionId)` | 获取消息树结构 |
| `createCheckpoint(sessionId, ...)` | 创建快照 |
| `rewind(sessionId, checkpoint)` | rewind 到某个快照 |
| `commitSession(sessionId, opts)` | git commit 当前会话工作目录的变更 |

Runtime 层在 `src/core/session-runtime.ts:133-148` 提供 `prompt / steer / follow-up / abort`，全部委托给 `AgentHarness`。

## 持久化

`src/core/session-storage.ts:12` 把消息存入 SQLite `messages` 表（`db.ts:115`）。每条消息有 `parent_id`，构成树。

## JSONL 日志

`src/core/session-log-file.ts:30` 把每个会话的 harness 事件流式写入 `~/.pi/supervisor/sessions/<id>.jsonl`，便于事后取回与回放。

## Git 集成

`src/core/session-git-hooks.ts:57-118`：

- 会话结束时自动 commit 工作目录的变更
- 利用 utility LLM 自动生成会话标题（`maybeAutoNameSession`）

## Checkpoint / Rewind

`src/core/session-checkpoint.ts:38-133`：

- `createCheckpoint` 记录当前 leaf id + 当前 git ref
- `rewind` 恢复到指定 checkpoint：消息树修剪（不删除原数据）+ git stash 恢复

## 分支语义

- `fork`：当前会话保持不变，新会话从同一 leaf 继续
- `clone`：完整克隆消息树（深拷贝）

## 事件流

SSE 端点 `GET /sessions/:id/events` 在 `src/http/http-server.ts:702` 实现，将 SessionManager 的事件广播给前端。

## 已知问题

详见 [已知未实装功能](/supervisor/known-gaps)。
