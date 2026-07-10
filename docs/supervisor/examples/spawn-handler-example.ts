/**
 * Reference: implement SpawnAgentToolProvider in your orchestrator package,
 * then register before spawning sessions.
 *
 * See db-spawn-agent-tool-provider.ts for a minimal DB-backed spawn_agent tool.
 */
import { startSupervisor } from "@earendil-works/pi-supervisor";
import { registerDefaultSpawnTool } from "./db-spawn-agent-tool-provider.js";

async function main() {
	const { manager, stop } = startSupervisor({ port: 3030 });

	registerDefaultSpawnTool(manager);

	const root = await manager.spawn({
		cwd: process.cwd(),
		agentId: "frontend-dev",
		instructions: "Parent session with spawn_agent tool available.",
	});

	console.log("session", root.id);
	await stop();
}

void main();
