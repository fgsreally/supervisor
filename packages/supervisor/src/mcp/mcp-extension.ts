import { defineExtension } from "../extension-system/define-extension.js";
import { McpClientManager } from "./mcp-client-manager.js";

/**
 * MCP Extension: connects to configured MCP servers and registers their tools.
 *
 * Configuration is in the agent's home directory: ~/.pi/supervisor/agents/{id}/mcp.json
 * Servers are connected on session.start and disconnected on session.end.
 */
export default defineExtension({
  name: "mcp",
  setup(ctx) {
    const manager = new McpClientManager(ctx.sessionId, ctx.agent.id);

    // Connect to MCP servers and register tools
    ctx.on("session.start", async () => {
      ctx.log("info", "MCP extension: connecting to servers");
      await manager.connectAll();

      // Register each tool from MCP servers via ctx.registerTool
      const tools = manager.getTools();
      for (const agentTool of tools) {
        // Convert AgentTool into ToolDefinition-compatible format
        // AgentTool has execute(toolCallId, params, signal, onUpdate)
        // ToolDefinition has execute(params, context)
        const toolDef = {
          name: agentTool.name,
          description: agentTool.description,
          parameters: agentTool.parameters,
          execute: async (params: unknown, _context: unknown) => {
            const result = await agentTool.execute("", params, undefined, () => {});
            return result;
          },
        };
        ctx.registerTool(toolDef as any);
        ctx.log("info", `MCP extension: registered tool ${agentTool.name}`);
      }

      ctx.log("info", `MCP extension: registered ${tools.length} tools`);
    });

    // Disconnect on session end
    ctx.on("session.end", async () => {
      ctx.log("info", "MCP extension: disconnecting");
      await manager.disconnectAll();
    });

    // Cleanup on extension unload
    return () => {
      void manager.disconnectAll();
    };
  },
});
