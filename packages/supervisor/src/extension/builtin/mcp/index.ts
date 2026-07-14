import type { ExtensionDefinition } from "../../types.js";
import { listAgentResourcePathsFromSqlite } from "../../../resources/sqlite-bindings.js";
import { McpClientManager } from "./client.js";
import { loadMcpConfigFile } from "./config.js";
import type { McpServerConfigType } from "./types.js";

function loadBoundServers(sourcePaths: string[]): Record<string, McpServerConfigType> {
  const servers: Record<string, McpServerConfigType> = {};
  for (const sourcePath of sourcePaths) {
    const config = loadMcpConfigFile(sourcePath);
    if (!config) continue;
    for (const [name, server] of Object.entries(config.servers)) {
      if (!server.disabled) servers[name] = server;
    }
  }
  return servers;
}

const mcpExtension: ExtensionDefinition = {
  name: "mcp",
  async setup(ctx) {
    if (!ctx.db.available) return;
    const sourcePaths = listAgentResourcePathsFromSqlite(ctx.db, ctx.agent.id, "mcp");
    if (sourcePaths.length === 0) return;

    const manager = new McpClientManager(loadBoundServers(sourcePaths));
    await manager.connectAll();
    for (const tool of manager.getTools()) ctx.agent.registerTool(tool);

    return () => manager.disconnectAll();
  },
};

export default mcpExtension;
