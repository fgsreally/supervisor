import { SUPERVISOR_RESOURCE_SCHEME } from "./constants.js";

export function sessionResourceUrl(sessionId: number, resource = "summary"): string {
	return `${SUPERVISOR_RESOURCE_SCHEME}://sessions/${sessionId}/${resource}`;
}

export function agentResourceUrl(agentId: number, resource = "summary"): string {
	return `${SUPERVISOR_RESOURCE_SCHEME}://agents/${agentId}/${resource}`;
}

export function agentSkillUrl(agentId: number, skillName: string): string {
	return `${SUPERVISOR_RESOURCE_SCHEME}://agents/${agentId}/skills/${encodeURIComponent(skillName)}`;
}

export function agentPromptUrl(agentId: number, promptName: string): string {
	return `${SUPERVISOR_RESOURCE_SCHEME}://agents/${agentId}/prompts/${encodeURIComponent(promptName)}`;
}
