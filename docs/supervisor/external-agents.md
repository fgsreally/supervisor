# 外部 Agent

Supervisor 除内置 harness 外，可驱动本机或协议型外部 Agent，实现位于 `src/core/external/`：

| 模块        | 文件                          | 说明                                       |
| ----------- | ----------------------------- | ------------------------------------------ |
| 基类 / 编排 | `external-session-runtime.ts` | 外部会话运行时抽象                         |
| 配置        | `external-agent-config.ts`    | 探测与配置                                 |
| Codex       | `codex-session-runtime.ts`    | OpenAI Codex 系 CLI/会话                   |
| Claude      | `claude-session-runtime.ts`   | Claude Agent SDK / CLI                     |
| ACP         | `acp-session-runtime.ts`      | Agent Client Protocol（Kimi / Cursor / MiMo / 通用） |

内置外部 Agent（启动时种子写入 DB，不依赖 Provider）：

| 名称        | `backendType` | 默认命令        | 协议 |
| ----------- | ------------- | --------------- | ---- |
| Codex       | `codex`       | `codex`         | app-server |
| Claude Code | `claude`      | `claude`        | stream-json / Agent SDK |
| Kimi Code   | `kimi`        | `kimi acp`      | ACP |
| Cursor      | `cursor`      | `agent acp`     | ACP |
| MiMo Code   | `mimo`        | `mimo acp`      | ACP |

认证由用户在本机自行完成（如 `agent login`、`claude login`），Supervisor 不代管登录，与 Codex / Claude Code 一致。

Cursor 通过 ACP 扩展方法时：

- `cursor/ask_question` / `cursor/create_plan`：桥接到 Web UI 的 `external_interaction`
- `cursor/update_todos` / `cursor/task` / `cursor/generate_image`：通知型，当前仅记录日志

## HTTP

| Method | Path                                                         | 说明                   |
| ------ | ------------------------------------------------------------ | ---------------------- |
| POST   | `/agents/detect`                                             | 探测本机可用外部 Agent |
| GET    | `/sessions/:id/external/codex/models`                        | Codex 模型             |
| POST   | `/sessions/:id/external/codex/settings`                      | Codex 设置             |
| POST   | `/sessions/:id/external/codex/commands`                      | Codex 命令             |
| POST   | `/sessions/:id/external-interactions/request`                | 发起外部交互           |
| POST   | `/sessions/:id/external-interactions/:interactionId/respond` | 回复外部交互           |

## Web UI

Chat 侧已有 Codex 等相关组件；完整外部 Agent 配置体验随 Agent 表单与 detect API 演进。未完成的体验项见 [Web UI 已知缺口](/web-ui/known-gaps)。

## 相关

- [会话管理](/supervisor/session)
- [HTTP API](/supervisor/http-api)
