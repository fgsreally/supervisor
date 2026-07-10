import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { SessionSpawner } from "./session-spawner.js";

export interface SpawnAgentRequest {
	agentId: number;
	instructions?: string;
	meta?: Record<string, unknown>;
}

export interface SpawnAgentResult {
	sessionId: number;
	status: string;
	agentId: number;
	name: string;
}

export interface SpawnAgentToolContext {
	/** Session that will expose spawn_agent (parent for child spawns). */
	parentSessionId: number;
	/** Agent bound to this session (main or child). */
	agentId: number | null;
	cwd: string;
	spawner: SessionSpawner;
}

const spawnAgentSchema = Type.Object({
	agentId: Type.Number({ description: "ID of the agent definition to spawn as a child session" }),
	instructions: Type.Optional(Type.String({ description: "Initial instructions to send to the spawned agent" })),
	meta: Type.Optional(
		Type.Record(Type.String(), Type.Unknown(), {
			description: "Optional metadata to attach to the spawned session",
		}),
	),
});

type SpawnAgentParams = Static<typeof spawnAgentSchema>;

/**
 * Implement `spawn` in your orchestrator package, register on SessionManager.
 * Base class builds the spawn_agent tool from your spawn logic.
 */
export abstract class SpawnAgentToolProvider {
	abstract spawn(context: SpawnAgentToolContext, request: SpawnAgentRequest): Promise<SpawnAgentResult>;

	createTools(context: SpawnAgentToolContext): AgentTool[] {
		const tool: AgentTool<typeof spawnAgentSchema> = {
			name: "spawn_agent",
			label: "spawn agent",
			description:
				"Spawn a child agent session from a registered agent definition. Returns the new session ID and status.",
			parameters: spawnAgentSchema,
			execute: async (_toolCallId, params: SpawnAgentParams) => {
				const result = await this.spawn(context, {
					agentId: params.agentId,
					instructions: params.instructions,
					meta: params.meta as Record<string, unknown> | undefined,
				});
				return {
					content: [{ type: "text", text: JSON.stringify(result) }],
					details: result,
				};
			},
		};
		return [tool];
	}
}
