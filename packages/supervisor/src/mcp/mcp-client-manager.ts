import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { McpServerConfigType, McpServerStatus } from "./mcp-types.js";
import { getActiveMcpServers } from "./mcp-config-loader.js";
import { mcpToolToAgentTool, type McpToolDefinition } from "./mcp-tool.js";

// ============================================================================
// Module-level session registry for lifecycle management
// ============================================================================

const sessionManagers = new Map<string, McpClientManager>();

export function getMcpManager(sessionId: string): McpClientManager | undefined {
  return sessionManagers.get(sessionId);
}

export function removeMcpManager(sessionId: string): void {
  sessionManagers.delete(sessionId);
}

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
  private readonly sessionId: string;
  private readonly agentId: string;
  private servers = new Map<string, InternalServerState>();
  private toolsCache: AgentTool[] | null = null;
  private connectPromise: Promise<void> | null = null;

  constructor(sessionId: string, agentId: string) {
    this.sessionId = sessionId;
    this.agentId = agentId;
  }

  /** Connect all active MCP servers for this agent. Idempotent. */
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

  private async doConnect(): Promise<void> {
    const activeServers = getActiveMcpServers(this.agentId);

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

  /** Disconnect all MCP servers. */
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

  /** Get all AgentTools from connected MCP servers. */
  getTools(): AgentTool[] {
    if (this.toolsCache) return this.toolsCache;
    this.toolsCache = this.buildTools();
    return this.toolsCache;
  }

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

  /** Call a tool on a specific MCP server. */
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

  /** Get status of all configured MCP servers (for UI display). */
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

// ============================================================================
// Public API: create MCP tools for session
// ============================================================================

export async function createMcpToolsForSession(
  sessionId: string,
  agentId: string,
): Promise<AgentTool[]> {
  const config = getActiveMcpServers(agentId);
  if (Object.keys(config).length === 0) return [];

  const manager = new McpClientManager(sessionId, agentId);
  await manager.connectAll();

  sessionManagers.set(sessionId, manager);
  return manager.getTools();
}

export async function disconnectMcpServers(sessionId: string): Promise<void> {
  const manager = sessionManagers.get(sessionId);
  if (manager) {
    await manager.disconnectAll();
    sessionManagers.delete(sessionId);
  }
}
