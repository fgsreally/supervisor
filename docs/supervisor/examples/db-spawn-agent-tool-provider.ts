/**
 * Reference implementation — one class, override spawn().
 */
import type { SessionManager } from "@earendil-works/pi-supervisor";
import {
	SpawnAgentToolProvider,
	type SpawnAgentRequest,
	type SpawnAgentResult,
	type SpawnAgentToolContext,
} from "@earendil-works/pi-supervisor";

export class DefaultSpawnAgentToolProvider extends SpawnAgentToolProvider {
	async spawn(context: SpawnAgentToolContext, request: SpawnAgentRequest): Promise<SpawnAgentResult> {
		const parent = context.spawner.getSession(context.parentSessionId);
		if (!parent) throw new Error(`Parent session ${context.parentSessionId} not found`);

		const agent = context.spawner.getAgent(request.agentId);
		if (!agent) throw new Error(`Agent ${request.agentId} not found`);

		const child = await context.spawner.spawn({
			parentId: context.parentSessionId,
			agentId: request.agentId,
			cwd: parent.cwd,
			instructions: request.instructions,
			meta: request.meta,
		});

		return {
			sessionId: child.id,
			status: child.status,
			agentId: request.agentId,
			name: agent.name,
		};
	}
}

export function registerDefaultSpawnTool(manager: SessionManager): void {
	manager.registerSpawnAgentToolProvider(new DefaultSpawnAgentToolProvider());
}
