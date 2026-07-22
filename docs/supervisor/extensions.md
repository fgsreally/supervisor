# 扩展框架

supervisor 的扩展框架允许在不修改核心会话运行时的前提下，向 agent 注入工具、订阅事件、注册 HTTP 命令。

## 扩展包结构

推荐形态：一个文件夹 + `package.json` + 入口文件。

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "dependencies": {}
}
```

入口文件 `export default defineExtension({ name, setup(ctx) { ... } })`。

加载时读取 `package.json` 的 `main` 字段；未设置时回退到 `index.ts` / `index.js`。

## 安装与绑定

```bash
# 支持本地路径、npm 包、GitHub 链接
pi-supervisor extensions install ./my-ext
pi-supervisor extensions install npm:my-ext@1.0.0
pi-supervisor extensions install https://github.com/acme/my-ext
pi-supervisor extensions install https://github.com/acme/monorepo/tree/main/packages/my-ext

# 通过数据库绑定到 agent
pi-supervisor extensions bind <agent-id> <extension-id>

# 从 package.json repository 字段拉取最新代码（保留资源路径）
pi-supervisor extensions update <extension-id>
```

安装一次、多个 agent 共用：全局目录里只有一份代码和 `node_modules`，各 agent 通过数据库 binding 选择资源。

扩展 `package.json` 需包含 `repository` 字段才能 `update`，例如：

```json
{
  "repository": "github:acme/my-ext"
}
```

monorepo 子目录：

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/acme/monorepo.git",
    "directory": "packages/my-ext"
  }
}
```

扩展只安装到全局 catalog；使用 `extensions bind` 为 Agent 创建数据库 binding。

## 加载目录

扩展安装到全局 catalog，Agent 通过数据库 `agent_resources` binding 选择扩展。Session 启动时只加载数据库中已绑定的扩展，不扫描 Agent Home 或项目目录。

打包工具（`edit`、`lsp`、`web` 等）在 `src/tools/`，由 agent 资源配置启用，不再走扩展目录。

## 内置扩展

随核心包提供（`src/extension/builtin/`），会话按需激活：

| 扩展              | 作用                         |
| ----------------- | ---------------------------- |
| `mcp`             | 连接 MCP 服务器并注册工具    |
| `subagent`        | `spawn_agent` 工具 + members |
| `shadow`          | Shadow 旁路观察              |
| `skill`           | Skill 资源注入               |
| `eval`            | 评估相关能力                 |
| `task-management` | 任务 / todo                  |
| `timer`           | Job 定时计划与触发           |
| `persistent-bash` | 以 Job 运行后台 shell        |
| `message-assets`  | 消息附件资源                 |

仓库级可选扩展见 [仓库扩展](/supervisor/shipped-extensions)。

## 工具边界

默认 agent 以会话资源绑定的工具为准；扩展可通过 `ctx.agent.tools.register` 增加工具。

## 扩展 Context

`setup(ctx)` 暴露业务域对象与少量宿主能力：

| 位置                              | 用途                                        |
| --------------------------------- | ------------------------------------------- |
| `ctx.session`                     | 会话域操作（spawn、发消息、meta、工具策略） |
| `ctx.session.current`             | 当前会话（id / cwd / 是否空闲等）           |
| `ctx.agent`                       | Agent 域操作（`tools.register`、改模型）    |
| `ctx.agent.current`               | 当前 agent（id / name / model 等）          |
| `ctx.jobs`                        | 创建、更新执行记录和定时计划                |
| `ctx.db`                          | 只读库查询                                  |
| `ctx.project`                     | 项目目录                                    |
| `ctx.ui`                          | 广播、审批                                  |
| `ctx.on` / `ctx.log` / `ctx.exec` | 事件、日志、命令                            |
| `ctx.flow` / `ctx.inject`         | Turn 流程与注入                             |

示例：

```ts
import { defineExtension, Type } from "pi-supervisor";

export default defineExtension({
  name: "demo",
  setup(ctx) {
    ctx.agent.tools.register({
      name: "ping",
      description: "Ping",
      parameters: Type.Object({}),
      async execute() {
        return {
          content: [
            {
              type: "text",
              text: `session ${ctx.session.current.id} / agent ${ctx.agent.current.id}`,
            },
          ],
        };
      },
    });

    ctx.on("session.start", async () => {
      await ctx.session.appendEntry("demo", { ok: true });
    });
  },
});
```
