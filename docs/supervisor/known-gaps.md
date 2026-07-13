# 已知未实装功能

本页列出 supervisor 源码中**已完成但未实装**或**完全未完成**的功能。这些是上游 pi 仓库遗留的状态，迁移到独立仓库时未做改动。

## ~~1. CLI 入口缺失（影响最大）~~ **已修复**

~~**症状**：
- `package.json` 声明 `bin: dist/cli.js` 和 `main: dist/index.js`
- SUPERVISOR.md 在文件结构图列出 `src/cli.ts`、`src/index.ts`（含 `startSupervisor()`）、`src/rpc-mode.ts`、`src/rpc-types.ts`~~

**当前状态**：`src/cli.ts` 和 `src/index.ts` 已从 git 历史恢复（原 pi 仓库 commit `1dfd00e` 恢复 web-ui 改动时误删了 supervisor 入口文件）。从 `1dfd00e^` 检出后导入路径已适配当前子目录结构。

`pnpm run serve` 可正常运行。`dist/cli.mjs --help` 正常输出命令帮助。

## 2. 扩展命令路由未挂钩

**症状**：`POST /sessions/:id/commands` 端点在 `src/http/http-server.ts:697-700` 显式返回 501。

**实际**：
- `src/extensions/http-commands.ts` 提供了 `createCommandRegistry()` / `createCommandRouter()`
- 扩展可以通过 `ctx.commands.register(name, handler)` 注册命令
- 但 http-server 的 commands 路由没有调用 `createCommandRouter`，所以扩展注册的命令对外不可达

**修复建议**：在 `http-server.ts` 的 `POST /sessions/:id/commands` 处替换 501 为 `commandRouter.handle(sessionId, body.command, body.args)`。

**症状**：`POST /sessions/:id/commands` 端点在 `src/http/http-server.ts:697-700` 显式返回 501。

**实际**：
- `src/extensions/http-commands.ts` 提供了 `createCommandRegistry()` / `createCommandRouter()`
- 扩展可以通过 `ctx.commands.register(name, handler)` 注册命令
- 但 http-server 的 commands 路由没有调用 `createCommandRouter`，所以扩展注册的命令对外不可达

**修复建议**：在 `http-server.ts` 的 `POST /sessions/:id/commands` 处替换 501 为 `commandRouter.handle(sessionId, body.command, body.args)`。

## 3. Hindsight 已迁至独立扩展

**现状**：长期记忆由 `extensions/hindsight`（`@earendil-works/supervisor-hindsight`）维护；核心包已移除 `core/hindsight.ts` 及 session 生命周期中的硬编码挂钩。

**使用**：将扩展放入 agent / 项目 extensions 目录；配置 `HINDSIGHT_API_URL` 走 API，否则默认本地 `projectDir/hindsight.jsonl` 回退。

## 4. Review 扩展只有 prompt builder

**症状**：`src/extensions/review.ts` 只导出 `buildReviewPrompt()`，没有完整的审批执行流程。

**实际**：还有调用 LLM、解读结果、根据 review 决定是否继续的逻辑没写。

## 5. Spawn Agent 扩展引用不存在的表

**症状**：`src/extensions/spawn-agent-tool.ts` 的 `createSpawnAgentTool` 引用了 `members` 表和 `listMemberAgentIdsByRole` SPI。

**实际**：`db.ts` 里没有 `members` 表，方法不存在。如果该工具被注册并在对话中调用，会崩溃。

## 6. `src/ext-framework/` 是 dead duplicate

**症状**：`src/ext-framework/` 整个目录与 `src/extensions/` 几乎一样（同名文件、同内容）。

**实际**：
- `src/ext-framework/index.ts` 的导出**没有任何 src 文件 import**
- 实际生效的是 `src/extensions/`

**修复建议**：删除 `src/ext-framework/` 整个目录。

## 7. `src/core/session.ts` 是死代码

**症状**：`src/core/session.ts` 定义了一个 `SessionRuntime`，但被 `src/core/session-runtime.ts` 的版本替代。

**实际**：grep 整个 src，没有文件 import `./session.js`。

**修复建议**：删除该文件。

**修复建议**：删除或在文件里加 export。

## 9. `src/session-runtime.ts`（顶层）疑似旧代码

**症状**：`src/session-runtime.ts`（顶层，不是 `src/core/session-runtime.ts`）也在重复定义会话运行时相关内容。

**实际**：`src/core/session-runtime.ts` 是真正生效的实现。顶层的 `session-runtime.ts` 没有被 import。

**修复建议**：删除该文件。

---

## 总结

| 问题 | 严重度 | 是否阻塞运行 |
|---|---|---|
| ~~CLI 入口缺失~~ | **~~高~~** | **~~是 — `pnpm run serve` 跑不起来~~** |
| `/commands` 路由 501 | 中 | 否（功能缺失） |
| hindsight 已迁至 extensions/hindsight | - | 否（需手动加载扩展） |
| review 扩展未完成 | 低 | 否 |
| spawn-agent 表缺失 | 中 | 否（不调用该工具就没事） |
| ext-framework dead code | 低 | 否（占空间） |
| session.ts / session-runtime.ts dead | 低 | 否 |

~~最高优先级是补 `src/cli.ts` 入口。~~ **已修复**：`src/cli.ts` 与 `src/index.ts` 已从 pi 仓库 git 历史恢复（commit `1dfd00e` 误删，从 `1dfd00e^` 检出后修复导入路径），CLI 可正常工作。其余问题都属于"功能不完整"但不阻塞构建。
