import type { ExtensionDefinition, ExtensionSqliteDatabase } from "../../types.js";
import { McpClientManager } from "./client.js";
import { loadMcpConfigFile } from "./config.js";
import type { McpServerConfigType } from "./types.js";

function listBoundMcpConfigPaths(sqlite: ExtensionSqliteDatabase, agentId: number): string[] {
  const rows = sqlite
    .prepare(
      `SELECT r.source_path AS source_path
       FROM resources r
       INNER JOIN agent_resources ar ON ar.resource_id = r.id
       WHERE ar.agent_id = ? AND ar.enabled = 1 AND r.kind = 'mcp'
       ORDER BY ar.priority DESC, r.slug`,
    )
    .all(agentId) as Array<{ source_path: string | null }>;
  return rows.map((row) => row.source_path).filter((path): path is string => Boolean(path));
}

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
    const sourcePaths = listBoundMcpConfigPaths(ctx.db, ctx.agent.id);
    if (sourcePaths.length === 0) return;

    const manager = new McpClientManager(loadBoundServers(sourcePaths));
    await manager.connectAll();
    for (const tool of manager.getTools()) ctx.agent.registerTool(tool);

    return () => manager.disconnectAll();
  },
};

export default mcpExtension;
