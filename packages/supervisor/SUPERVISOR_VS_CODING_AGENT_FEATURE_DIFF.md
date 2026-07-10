# Supervisor vs Coding-Agent 功能差异（仅看使用层）

> 范围：只比较用户可见能力与使用体验，不讨论底层实现、存储结构、代码架构。

## 一句话结论

如果你的目标是“像 `pi` 一样本地交互开发”，`coding-agent` 依然更完整；  
如果你的目标是“服务化、多会话编排、通过 HTTP/RPC 控制”，`supervisor` 更直接。  
当前 `supervisor` 已补上两件关键能力：**插件可注册命令**、**默认内建工具集与 coding-agent 对齐**。

---

## coding-agent 有、supervisor 当前没有（或未内建）的功能

## 1) 交互式命令与会话操作（TUI 内）

- `coding-agent` 支持大量内建命令：`/resume`、`/new`、`/name`、`/session`、`/tree`、`/fork`、`/clone`、`/compact`、`/copy`、`/export`、`/share`、`/reload`、`/hotkeys`、`/settings` 等。
- `supervisor` 的内建命令仍较少（`/help`、`/clear`、`/exit`），但已经支持**通过插件新增命令**（例如 `/mycmd`）。

## 2) 会话树浏览与分支编辑体验

- `coding-agent` 原生提供 `/tree` 在同一会话树上跳转任意历史节点继续对话。
- `coding-agent` 原生提供 `/fork`、`/clone`。
- `supervisor` 虽有父子会话与 `children` 查询，但没有等价的“树浏览器 + 交互式分支切换”体验。

## 3) 本地资源生态（更细化）

- `coding-agent`：
  - 内建资源类型：Extensions、Skills、Prompt Templates、Themes、Pi Packages。
  - 有完整管理命令：`install/remove/update/list/config`，可直接启停与分发包。
  - 扩展能力覆盖面更广：工具、命令、快捷键、会话流程、UI 区块等。
- `supervisor`：
  - 当前插件目录发现与加载：`~/.pi/supervisor/plugins` 和 `<cwd>/.pi/supervisor/plugins`。
  - 插件类型偏向 `tui` / `ui`，用于消息渲染、工具渲染、事件订阅，现已支持注册 chat 命令。
  - 没有对等的包管理命令与完整资源生态（例如 skills/prompts/themes 的统一管理流）。

### `supervisor` 扩展 vs `coding-agent` 扩展（功能差异）

- 都能扩展命令：`coding-agent` 原生完整命令系统；`supervisor` 现支持插件注册 chat 命令。
- 都能扩展展示：`coding-agent` UI 扩展面更广；`supervisor` 目前聚焦消息/工具渲染。
- 资源生命周期：`coding-agent` 有统一启停、安装与更新入口；`supervisor` 主要是目录发现 + 加载。

## 4) CLI 能力：`coding-agent` 这些参数分别干什么

- `--mode json`：输出事件流 JSON，便于脚本或日志系统消费。
- `--export <in> [out]`：把会话导出成 HTML，适合沉淀审阅记录。
- `--session/--fork/--session-dir/--no-session`：指定会话、从会话分叉、指定会话目录、或无持久化临时会话。
- `--tools/--no-tools`：精确控制工具集是否开启与可用范围。
- `--extension/--skill/--prompt-template/--theme`：显式加载外部能力资源。
- `--no-context-files`：关闭 AGENTS/CLAUDE 上下文自动加载，做更干净的运行。
- `supervisor` CLI 仍然更聚焦服务与会话控制（`serve/chat/continue/list/kill/delete/print`）。

## 5) 内建工具集（默认能力范围）

- `coding-agent` 内建工具：`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`。
- `supervisor` 现在已对齐：默认 `coding` 预设同样提供这 7 个工具。

## 6) 用户侧会话管理便捷性

- `coding-agent` 支持 `pi -c`（继续最近）、`pi -r`（选择历史）、`--no-session`（临时会话）等高频入口。
- `supervisor` 目前主要通过会话 ID 或列表选择继续，不提供同等级的一键会话管理参数集合。

## 7) 内建“账号登录型”入口

- `coding-agent` 有 `/login`、`/logout` 的内建交互（含订阅/OAuth场景）。
- `supervisor` 主要走 provider/model 与数据库配置流，不是这套登录交互模型。

---

## tree / fork / clone 的真实场景（为什么有用）

场景：你在修复线上支付超时问题，先做了“重试+超时参数”方案，后续怀疑是连接池耗尽导致。  
这时：

- `tree`：回到“加入重试之前”的节点，走另一条“连接池参数排查”分支，不污染当前分支。
- `fork`：从较早的“需求确认消息”单独开一条“保守补丁”方案，给生产快速止血。
- `clone`：复制当前最优分支，开“性能增强实验版”（例如并发限流），失败可直接丢弃。

价值：并行验证多个思路，且每条路径都保留可追溯历史，回退成本很低。

---

## supervisor 有、coding-agent 不同侧重的功能

- 面向服务编排的 HTTP API：`/sessions`、`/sessions/:id/prompt`、`/steer`、`/follow-up`、`/abort`、`/model`、`/thinking-level`、`/meta` 等。
- 多会话编排接口（包含父子会话关系）更直接，适合上层系统调度。
- RPC 上补充了编排向命令：`spawn_session`、`list_sessions`、`get_children`、`patch_meta`。

---

## 迁移判断建议（纯功能角度）

- 你要“本地开发助手 + 丰富交互能力 + 插件生态”：优先 `coding-agent`。
- 你要“可编排、可服务化、可被外部系统调用”：优先 `supervisor`。
- 你要二者兼得：常见做法是保留 `coding-agent` 作为人机交互前端，`supervisor` 作为多会话编排后端。

