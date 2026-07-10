# HTTP API 参考

实现：`src/http/http-server.ts`（Hono）。默认端口 3030。

所有路由前缀无（根路径）。响应 JSON。错误返回 `{ error: string }` 与对应状态码。

## Provider

| Method | Path | 说明 |
|---|---|---|
| GET | `/providers` | 列出所有 provider |
| POST | `/providers` | 创建 provider |
| GET | `/providers/:id` | 获取单个 |
| PATCH | `/providers/:id` | 更新 |
| DELETE | `/providers/:id` | 删除 |
| POST | `/providers/:id/models` | 添加 model |
| PATCH | `/providers/:id/models/:modelId` | 更新 model |
| DELETE | `/providers/:id/models/:modelId` | 删除 model |

参考：`src/http/http-server.ts` Provider 路由段。

## Agent

| Method | Path | 说明 |
|---|---|---|
| GET | `/agents` | 列出所有 |
| POST | `/agents` | 创建 |
| GET | `/agents/:id` | 获取 |
| PATCH | `/agents/:id` | 更新 |
| DELETE | `/agents/:id` | 删除 |
| GET | `/agents/:id/system-md` | 读取 SYSTEM.md |
| GET | `/agents/:id/resources` | 列出 agent 资源（skills / prompts / extensions） |
| POST | `/agents/:id/resources/link` | 把全局资源链接到 agent |

## Session

| Method | Path | 说明 |
|---|---|---|
| GET | `/sessions` | 列出所有 |
| POST | `/sessions` | 创建 |
| GET | `/sessions/:id` | 获取 |
| DELETE | `/sessions/:id` | 删除 |
| POST | `/sessions/:id/prompt` | 发送消息（请求体 `{ message, files?, ... }`） |
| POST | `/sessions/:id/steer` | 中途引导（不增加 user message） |
| POST | `/sessions/:id/follow-up` | 紧接上一轮继续 |
| POST | `/sessions/:id/abort` | 中止当前轮 |
| POST | `/sessions/:id/kill` | 杀进程 |
| POST | `/sessions/:id/complete` | 完成会话 |
| GET | `/sessions/:id/state` | 当前状态（含 isRunning、availableCommands） |
| GET | `/sessions/:id/messages` | 消息树 |
| GET | `/sessions/:id/tree` | 树状结构 |
| GET | `/sessions/:id/events` | SSE 事件流 |
| POST | `/sessions/:id/fork` | fork |
| POST | `/sessions/:id/clone` | clone |
| POST | `/sessions/:id/checkpoint` | 创建 checkpoint |
| GET | `/sessions/:id/checkpoints` | 列出 checkpoint |
| POST | `/sessions/:id/rewind` | rewind |
| POST | `/sessions/:id/commit` | git commit |
| POST | `/sessions/:id/ask-answer` | 回答 ask 工具的提问 |
| **POST** | **`/sessions/:id/commands`** | **未实现** — `http-server.ts:697-700` 显式 501 |

## Files / Workspace

| Method | Path | 说明 |
|---|---|---|
| GET | `/files/content?path=<path>` | 读取文件（仅限 supervisor agent 工作目录或 `~/.pi` 下） |
| GET | `/workspace/files?dir=<path>` | 列出工作区文件 |

## Resources

| Method | Path | 说明 |
|---|---|---|
| GET | `/resources/global` | 列出全局资源（~/.pi/supervisor/global/） |

## 错误码

- `400` 参数错误
- `404` 资源不存在
- `409` 状态不允许
- `500` 内部错误
- `501` 功能未实现（仅 `/commands`）

## 备注

- `POST /sessions/:id/commands` 当前返回 501，扩展命令路由未挂钩，详见 [已知未实装功能](/supervisor/known-gaps)。
- 文件读取端点有路径白名单，详见 `src/http/http-server.ts:850` 起的 `GET /files/content` 实现。
