# MCP 集成

supervisor 内置 MCP（Model Context Protocol）客户端，能在会话启动时自动连接 MCP 服务器，把 MCP 工具适配成 `AgentTool` 注入到 agent。

## 模块

| 文件 | 职责 |
|---|---|
| `src/mcp/mcp-client-manager.ts` | MCP 客户端连接管理（Stdio + SSE 两种 transport） |
| `src/mcp/mcp-config-loader.ts` | 加载 MCP 配置文件 |
| `src/mcp/mcp-tool.ts` | 把 MCP tool schema 适配为 `AgentTool` |
| `src/mcp/mcp-types.ts` | TypeBox schema：`McpConfig`、`McpStdioServerConfig`、`McpSseServerConfig` 等 |
| `src/mcp/mcp-extension.ts` | `defineExtension` 入口：会话 start/connect，end/disconnect |

公共导出在 `src/mcp/index.ts`：

```ts
export { McpClientManager, createMcpToolsForSession, disconnectMcpServers, getMcpManager, removeMcpManager } from "./mcp-client-manager.js";
export { loadMcpConfig, getActiveMcpServers } from "./mcp-config-loader.js";
export { mcpToolToAgentTool } from "./mcp-tool.js";
export type { McpConfig, McpServerConfigType, McpServerStatus } from "./mcp-types.js";
export { McpConfigSchema, McpServerConfig, McpStdioServerConfig, McpSseServerConfig } from "./mcp-types.js";
```

## 配置文件

每个 agent 自己的 MCP 配置在：

```
~/.pi/supervisor/agents/<agent-id>/mcp.json
```

格式（`McpConfig`）：

```json
{
  "mcpServers": {
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

`mcp-config-loader.ts` 会解析 `${VAR}` 风格的 env 占位符。

## 生命周期

`mcp-extension.ts`：

1. `session.start` 事件触发 → `connectAll(servers)`，把所有 MCP server 工具通过 `mcpToolToAgentTool` 注册到 SessionRuntime
2. `session.end` 事件触发 → `disconnectMcpServers(agentId)`

## 工具适配

`mcp-tool.ts` 把 MCP 的 JSON Schema 转成 TypeBox schema（`@sinclair/typebox`），再包装成 `AgentTool` 的 `prepareArguments` / `execute` 接口。

## 备注

- `typebox` 与 `typebox/value` 是间接依赖（通过 `@earendil-works/pi-agent-core` 引入），未在 supervisor 的 `dependencies` 中显式声明。tsdown 构建时会有 `UNRESOLVED_IMPORT` 警告，运行时由 Node.js 的 ESM resolver 解析。
- `@ast-grep/napi` 同上，是 ast-grep 工具的间接依赖。
