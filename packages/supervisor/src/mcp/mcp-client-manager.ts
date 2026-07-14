import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { McpServerConfigType, McpServerStatus } from "./mcp-types.js";
import { mcpToolToAgentTool, type McpToolDefinition } from "./mcp-tool.js";

// ============================================================================
// Type for the SDK's Tool type
// ============================================================================

interface SdkTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

// ============================================================================
// McpClientManager
// ============================================================================

interface InternalServerState {
  serverName: string;
  config: McpServerConfigType;
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;
  tools: McpToolDefinition[];
  connected: boolean;
  error?: string;
}

export class McpClientManager {
  /** 已尝试连接的 MCP 服务及其运行状态。 */
  private servers = new Map<string, InternalServerState>();
  /** 已转换为 AgentTool 的 MCP 工具缓存。 */
  private toolsCache: AgentTool[] | null = null;
  /** 正在进行的连接任务，用于合并并发 connectAll 调用。 */
  private connectPromise: Promise<void> | null = null;
  /** Resource 类从数据库绑定中传入的 MCP 服务配置。 */
  private readonly configuredServers: Record<string, McpServerConfigType>;

  /** 创建当前 Agent 独占的 MCP 客户端管理器。 */
  constructor(configuredServers?: Record<string, McpServerConfigType>) {
    this.configuredServers = configuredServers ?? {};
  }

  /** 连接当前 Agent 的全部启用 MCP 服务；重复调用是幂等的。 */
  async connectAll(): Promise<void> {
    // Use singleton so concurrent calls wait for the same connection attempt
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.doConnect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  /** 执行一次实际连接，并记录每个 MCP 服务的成功或错误状态。 */
  private async doConnect(): Promise<void> {
    const activeServers = this.configuredServers;

    const entries = Object.entries(activeServers);
    if (entries.length === 0) return;

    await Promise.all(
      entries.map(async ([name, config]) => {
        try {
          const client = new Client(
            {
              name: `pi-supervisor-mcp-${name}`,
              version: "1.0.0",
            },
            {
              capabilities: {},
            },
          );

          let transport: StdioClientTransport | SSEClientTransport;

          if (config.type === "stdio") {
            transport = new StdioClientTransport({
              command: config.command,
              args: config.args ?? [],
              env: (config.env as Record<string, string>) ?? undefined,
              stderr: "pipe" as const,
            });
          } else {
            // SSE transport
            transport = new SSEClientTransport(new URL(config.url));
          }

          await client.connect(transport);

          // Fetch available tools
          const toolsResult = await client.listTools();
          const tools: McpToolDefinition[] = (toolsResult.tools as SdkTool[]).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          }));

          this.servers.set(name, {
            serverName: name,
            config,
            client,
            transport,
            tools,
            connected: true,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          // Store as errored server but still track it
          this.servers.set(name, {
            serverName: name,
            config,
            client: null as unknown as Client,
            transport: null as unknown as StdioClientTransport | SSEClientTransport,
            tools: [],
            connected: false,
            error: message,
          });
        }
      }),
    );

    // Build tool cache
    this.toolsCache = this.buildTools();
  }

  /** 断开全部 MCP 服务并清除工具缓存。 */
  async disconnectAll(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const [, state] of this.servers) {
      if (state.connected && state.client) {
        closePromises.push(
          (async () => {
            try {
              await state.client.close();
            } catch {
              // Ignore close errors
            }
          })(),
        );
      }
    }

    await Promise.all(closePromises);
    this.servers.clear();
    this.toolsCache = null;
  }

  /** 返回全部已连接 MCP 服务转换出的 AgentTool。 */
  getTools(): AgentTool[] {
    if (this.toolsCache) return this.toolsCache;
    this.toolsCache = this.buildTools();
    return this.toolsCache;
  }

  /** 从已连接服务的工具定义构建 AgentTool 列表。 */
  private buildTools(): AgentTool[] {
    const tools: AgentTool[] = [];

    for (const [, state] of this.servers) {
      if (!state.connected) continue;

      for (const mcpTool of state.tools) {
        tools.push(
          mcpToolToAgentTool(state.serverName, mcpTool, async (toolName, params) => {
            const result = await state.client.callTool({
              name: toolName,
              arguments: params as Record<string, unknown>,
            });
            return result;
          }),
        );
      }
    }

    return tools;
  }

  /** 调用指定 MCP 服务上的工具。 */
  async callTool(serverName: string, toolName: string, params: unknown): Promise<unknown> {
    const state = this.servers.get(serverName);
    if (!state || !state.connected) {
      throw new Error(`MCP server "${serverName}" is not connected`);
    }

    const result = await state.client.callTool({
      name: toolName,
      arguments: params as Record<string, unknown>,
    });
    return result;
  }

  /** 返回全部 MCP 服务的连接状态，供 API 和 UI 展示。 */
  getServerStatuses(): McpServerStatus[] {
    const statuses: McpServerStatus[] = [];

    for (const [name, state] of this.servers) {
      statuses.push({
        name,
        type: state.config.type,
        command: state.config.type === "stdio" ? state.config.command : undefined,
        args: state.config.type === "stdio" ? state.config.args : undefined,
        url: state.config.type === "sse" ? state.config.url : undefined,
        connected: state.connected,
        error: state.error,
        toolCount: state.tools.length,
      });
    }

    return statuses;
  }
}
