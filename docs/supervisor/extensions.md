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

# 软链到 agent（不复制、不重复安装依赖）
pi-supervisor extensions link <agent-id> <extension-id>

# 从 package.json repository 字段拉取最新代码（保留目录，软链不失效）
pi-supervisor extensions update <extension-id>
```

安装一次、多个 agent 共用：全局目录里只有一份代码和 `node_modules`，各 agent 通过软链引用。

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

不推荐 `extensions agent-install` 复制扩展；若源路径已在全局 catalog，请用 `link`。

## 加载目录

`discoverAndLoadExtensions()` 默认只扫描 agent 目录：

- `<agentHomeDir>/extensions`

项目目录 `<cwd>/.pi/supervisor/extensions` 仅在 `LOAD_PROJECT_RESOURCES=true` 时启用。

supervisor 不再默认加载任何工具扩展。仓库随包提供的 `supervisor-agent-tools` 只是可选扩展，路径可通过 `getSupervisorAgentToolsExtensionPath()` 获得。

## 工具边界

默认 agent 工具只保留 pi 原生 4 个：

- `read`
- `bash`
- `edit`
- `write`

其他工具，包括 `ask`、`read_pattern`、`lsp`、`ast_grep`、输出压缩等，都必须通过扩展注册或覆盖。

## 可选工具扩展

`src/extensions/agent-tools/index.ts` 提供一个可选工具扩展，名称为 `supervisor-agent-tools`。它注册：

- `ask`
- `read_pattern`
- `lsp`
- `edit` 覆盖
- 可用时注册 `ast_grep`
- `tool.after_call` 输出压缩

是否加载它由用户或上层配置决定。
