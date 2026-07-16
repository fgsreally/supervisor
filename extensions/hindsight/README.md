# @earendil-works/supervisor-hindsight

Supervisor 扩展：长期记忆（Hindsight），从 omp 移植核心能力，在 `extensions/` 独立维护，不依赖 supervisor 核心内置逻辑。

## 能力

- **工具**：`retain`、`recall`、`reflect`
- **自动 recall**：首条用户消息时通过 turn injection 注入 `<memories>` 块
- **自动 retain**：每 N 轮 `agent.end` 时写入记忆
- **Bank 作用域**：`global` / `per-project` / `per-project-tagged`（默认）
- **双模式**：
  - **API 模式**：配置 `HINDSIGHT_API_URL` 后连接 Hindsight HTTP API
  - **本地回退**：未配置 API 时写入 `projectDir/hindsight.jsonl`（替代原核心内置 jsonl）

## 安装

将本包放到项目的 `.pi/supervisor/extensions/` 或 agent 全局 extensions 目录，或通过 pnpm workspace 链接：

```bash
pnpm install
```

## 配置（环境变量）

| 变量                             | 说明                                            | 默认                 |
| -------------------------------- | ----------------------------------------------- | -------------------- |
| `HINDSIGHT_API_URL`              | Hindsight API 根地址                            | 未设置则走本地 jsonl |
| `HINDSIGHT_API_TOKEN`            | Bearer token                                    | -                    |
| `HINDSIGHT_BANK_ID`              | Bank 名称                                       | `default`            |
| `HINDSIGHT_BANK_ID_PREFIX`       | Bank 前缀                                       | `supervisor`         |
| `HINDSIGHT_SCOPING`              | `global` / `per-project` / `per-project-tagged` | `per-project-tagged` |
| `HINDSIGHT_AUTO_RECALL`          | 首 turn 自动 recall                             | `true`               |
| `HINDSIGHT_AUTO_RETAIN`          | 周期性自动 retain                               | `true`               |
| `HINDSIGHT_RETAIN_EVERY_N_TURNS` | 自动 retain 间隔（用户轮次）                    | `3`                  |
| `HINDSIGHT_LOCAL_FALLBACK`       | API 未配置时启用本地 jsonl                      | `true`               |

完整列表见 `config.ts`（对齐 omp `hindsight.*` 语义）。

## 与核心 supervisor 的关系

- 已从 `packages/supervisor` 移除 `core/hindsight.ts` 及 `session-manager` / `session-lifecycle` 中的硬编码挂钩
- 记忆注入通过扩展 API `ctx.inject.reattach("hindsight", ...)` 实现，无需修改核心 system prompt 构建逻辑
- Mental Models 等 omp 高级能力可在后续版本追加

## 测试

```bash
cd extensions/hindsight && pnpm test
```
