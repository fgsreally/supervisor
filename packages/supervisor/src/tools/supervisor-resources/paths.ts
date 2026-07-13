/** REST-style resource path aligned with the HTTP API (e.g. GET /sessions/:id/messages). */
export function sessionResourcePath(sessionId: number, resource = "summary"): string {
	if (resource === "summary") {
		return `/sessions/${sessionId}`;
	}
	return `/sessions/${sessionId}/${resource}`;
}

export function agentResourcePath(agentId: number, resource = "summary"): string {
	if (resource === "summary") {
		return `/agents/${agentId}`;
	}
	return `/agents/${agentId}/${resource}`;
}

export function agentSkillPath(agentId: number, skillName: string): string {
	return `/agents/${agentId}/skills/${encodeURIComponent(skillName)}`;
}

export function agentPromptPath(agentId: number, promptName: string): string {
	return `/agents/${agentId}/prompts/${encodeURIComponent(promptName)}`;
}
