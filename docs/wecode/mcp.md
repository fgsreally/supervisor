# MCP 集成

wecode 将 MCP（Model Context Protocol）实现为内置插件。会话激活插件时连接 Agent 绑定的 MCP 服务器，并把 MCP 工具注册为插件工具。

## 模块

| 文件                                  | 职责                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `src/plugin/builtin/mcp/index.ts`  | 内置插件入口；读取绑定、注册工具、返回连接清理函数                           |
| `src/plugin/builtin/mcp/client.ts` | MCP 客户端连接管理（Stdio + SSE 两种 transport）                             |
| `src/plugin/builtin/mcp/config.ts` | 加载 MCP 配置文件                                                            |
| `src/plugin/builtin/mcp/tool.ts`   | 把 MCP tool schema 适配为插件工具                                            |
| `src/plugin/builtin/mcp/types.ts`  | TypeBox schema：`McpConfig`、`McpStdioServerConfig`、`McpSseServerConfig` 等 |

这些模块是 Wecode 内部实现，不作为独立包子路径导出。

## 配置文件

MCP 配置以 `mcp` 资源安装并绑定到 Agent。运行时从 `resources.source_path` 读取所有已启用绑定，
按 binding priority 与 slug 合并 server；配置文件不要求位于 Agent Home。例如：

```
/path/to/resources/team-mcp.json
```

格式（`McpConfig`）：

```json
{
  "servers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
      "env": { "FOO": "bar" }
    },
    "remote-service": {
      "type": "sse",
      "url": "https://example.com/mcp/sse"
    }
  }
}
```

`config.ts` 会解析 `${env:VAR}` 风格的环境变量占位符。

## 生命周期

1. `SessionPluginHost` 激活 builtin MCP plugin。
2. 插件读取 Agent 的 `mcp` 资源绑定并调用 `connectAll()`。
3. MCP 工具通过 `ctx.agent.registerTool()` 注册。
4. Session 清理插件时执行 cleanup，调用 `disconnectAll()`。

## 工具适配

`tool.ts` 把 MCP 的 JSON Schema 转成 TypeBox schema，再包装成插件 `ToolDefinition`。

## 备注

- `@ast-grep/napi` 的构建警告来自可选 ast-grep 工具，与 MCP 插件无关。
