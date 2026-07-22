# HTTP API 参考

实现：`packages/supervisor/src/http/http-server.ts`（Hono）。默认端口 3030。响应 JSON；错误形如 `{ error: string }`。

## Health / Settings

| Method | Path        | 说明     |
| ------ | ----------- | -------- |
| GET    | `/healthz`  | 健康检查 |
| GET    | `/settings` | 读取设置 |
| PATCH  | `/settings` | 更新设置 |

## Provider

| Method | Path                             | 说明     |
| ------ | -------------------------------- | -------- |
| GET    | `/providers`                     | 列出     |
| POST   | `/providers`                     | 创建     |
| GET    | `/providers/:id`                 | 获取     |
| PATCH  | `/providers/:id`                 | 更新     |
| DELETE | `/providers/:id`                 | 删除     |
| GET    | `/providers/:id/models`          | 列出模型 |
| POST   | `/providers/:id/models`          | 添加模型 |
| PATCH  | `/providers/:id/models/:modelId` | 更新模型 |
| DELETE | `/providers/:id/models/:modelId` | 删除模型 |

## Agent

| Method | Path                                | 说明               |
| ------ | ----------------------------------- | ------------------ |
| GET    | `/agents`                           | 列出               |
| POST   | `/agents`                           | 创建               |
| POST   | `/agents/detect`                    | 探测本机外部 Agent |
| GET    | `/agents/:id`                       | 获取               |
| PATCH  | `/agents/:id`                       | 更新               |
| DELETE | `/agents/:id`                       | 删除               |
| PATCH  | `/agents/:id/meta`                  | 更新 meta          |
| GET    | `/agents/:id/system-md`             | 读取 SYSTEM.md     |
| PUT    | `/agents/:id/system-md`             | 写入 SYSTEM.md     |
| GET    | `/agents/:id/resources`             | 列出资源           |
| GET    | `/agents/:id/tools`                 | 列出可用工具       |
| GET    | `/agents/:id/resource-bindings`     | 资源绑定           |
| POST   | `/agents/:id/resources`             | 绑定资源           |
| DELETE | `/agents/:id/resources/:resourceId` | 解除绑定           |

内置 Agent（`builtin: true`）只读：禁止更新、删除、改 system prompt 与资源绑定。

## Project

| Method | Path            | 说明 |
| ------ | --------------- | ---- |
| GET    | `/projects`     | 列出 |
| POST   | `/projects`     | 创建 |
| GET    | `/projects/:id` | 获取 |
| DELETE | `/projects/:id` | 删除 |

## Session — 生命周期与对话

| Method | Path                                     | 说明                                       |
| ------ | ---------------------------------------- | ------------------------------------------ |
| GET    | `/sessions`                              | 列出                                       |
| POST   | `/sessions`                              | 创建                                       |
| GET    | `/sessions/:id`                          | 获取                                       |
| DELETE | `/sessions/:id`                          | 删除                                       |
| POST   | `/sessions/:id/prompt`                   | 发送消息                                   |
| POST   | `/sessions/:id/steer`                    | 立即干预（不新增 user message 语义见实现） |
| POST   | `/sessions/:id/follow-up`                | 轮后追加                                   |
| POST   | `/sessions/:id/abort`                    | 中止当前轮                                 |
| POST   | `/sessions/:id/kill`                     | 杀进程                                     |
| POST   | `/sessions/:id/complete`                 | 完成会话                                   |
| POST   | `/sessions/:id/send`                     | 发送（兼容路径）                           |
| GET    | `/sessions/:id/state`                    | 运行状态、可用命令等                       |
| GET    | `/sessions/:id/messages`                 | 消息树                                     |
| GET    | `/sessions/:id/tree`                     | 会话树                                     |
| GET    | `/sessions/:id/children`                 | 直接子会话                                 |
| GET    | `/sessions/:id/events`                   | SSE 事件流                                 |
| GET    | `/sessions/:id/queued-inputs`            | 排队输入                                   |
| POST   | `/sessions/:id/btw`                      | BTW 子会话                                 |
| POST   | `/sessions/:id/fork`                     | fork                                       |
| POST   | `/sessions/:id/clone`                    | clone                                      |
| PATCH  | `/sessions/:id/meta`                     | 合并 meta                                  |
| PUT    | `/sessions/:id/meta`                     | 替换 meta                                  |
| PATCH  | `/sessions/:id/messages/:messageId/meta` | 消息 meta                                  |

## Session — 命令 / 模型 / 压缩 / 检查点

| Method | Path                           | 说明                |
| ------ | ------------------------------ | ------------------- |
| GET    | `/sessions/:id/commands`       | 列出 slash 命令     |
| POST   | `/sessions/:id/commands`       | 执行 slash 命令     |
| POST   | `/sessions/:id/model`          | 切换模型            |
| POST   | `/sessions/:id/thinking-level` | 设置 thinking level |
| POST   | `/sessions/:id/compact`        | 触发压缩            |
| POST   | `/sessions/:id/checkpoints`    | 创建 checkpoint     |
| GET    | `/sessions/:id/checkpoints`    | 列出 checkpoint     |
| POST   | `/sessions/:id/rewind`         | rewind              |
| POST   | `/sessions/:id/commit`         | git commit          |
| GET    | `/sessions/:id/commits`        | 列出 commits        |

## Session — 成员 / 工作流 / 任务

| Method | Path                       | 说明                |
| ------ | -------------------------- | ------------------- |
| GET    | `/sessions/:id/members`    | 子代理成员          |
| PUT    | `/sessions/:id/members`    | 更新成员            |
| GET    | `/sessions/:id/workflow`   | 读取 workflow 状态  |
| PATCH  | `/sessions/:id/workflow`   | 更新 stage / status |
| DELETE | `/sessions/:id/workflow`   | 清除 workflow       |
| GET    | `/sessions/:id/todos`      | todos               |
| GET    | `/sessions/:id/tasks`      | tasks               |
| GET    | `/sessions/:id/eval-state` | eval 状态           |

## Session — 交互 / 外部 Agent / 资源文件

| Method | Path                                                         | 说明           |
| ------ | ------------------------------------------------------------ | -------------- |
| POST   | `/sessions/:id/ask-answer`                                   | 回答 ask 工具  |
| POST   | `/sessions/:id/approval-resolve`                             | 审批决议       |
| GET    | `/sessions/:id/external/codex/models`                        | Codex 模型列表 |
| POST   | `/sessions/:id/external/codex/settings`                      | Codex 设置     |
| POST   | `/sessions/:id/external/codex/commands`                      | Codex 命令     |
| POST   | `/sessions/:id/external-interactions/:interactionId/respond` | 外部交互回复   |
| POST   | `/sessions/:id/external-interactions/request`                | 发起外部交互   |
| GET    | `/sessions/:id/recordings/:filename`                         | 录制文件       |
| GET    | `/sessions/:id/assets/:scope/*`                              | 会话资源文件   |

## Messages / Files / Workspace

| Method | Path                    | 说明                 |
| ------ | ----------------------- | -------------------- |
| GET    | `/messages/search`      | 消息 FTS 搜索        |
| GET    | `/files/content?path=`  | 读文件（路径白名单） |
| GET    | `/workspace/files?dir=` | 列工作区文件         |

## Resources / Extensions / Upload

| Method | Path                        | 说明         |
| ------ | --------------------------- | ------------ |
| GET    | `/resources/global`         | 全局资源     |
| GET    | `/resources`                | 资源列表     |
| POST   | `/resources/install`        | 安装资源     |
| POST   | `/resources/uninstall`      | 卸载资源     |
| GET    | `/extensions`               | 扩展 catalog |
| POST   | `/extensions/install`       | 安装扩展     |
| POST   | `/extensions/:id/update`    | 更新扩展     |
| POST   | `/extensions/:id/uninstall` | 卸载扩展     |
| POST   | `/upload/icons`             | 上传图标     |
| GET    | `/uploaded-icons/:filename` | 读取图标     |

## 错误码

- `400` 参数错误
- `404` 资源不存在
- `409` 状态不允许
- `500` 内部错误

## 备注

- Slash 命令已实现：`GET/POST /sessions/:id/commands`。
- 文件读取有路径白名单，见 `http-server.ts` 中 `GET /files/content`。
- 工作流语义见 [工作流](/supervisor/workflow)；外部 Agent 见 [外部 Agent](/supervisor/external-agents)。
