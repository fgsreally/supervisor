import type { Agent, Session, SpawnSessionOptions } from "../types.js";

/**
 * Narrow surface passed to SpawnAgentToolProvider via context.
 */
export interface SessionSpawner {
	getSession(sessionId: number): Session | undefined;
	getAgent(agentId: number): Agent | undefined;
	spawn(options: SpawnSessionOptions): Promise<Session>;
}
