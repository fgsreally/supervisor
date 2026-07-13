export interface ParsedSupervisorResourceUrl {
	agentId?: number;
	sessionId?: number;
	kind: "session" | "agent";
	resource: string;
	skillName?: string;
	promptName?: string;
}

export function parseSupervisorResourceUrl(url: string): ParsedSupervisorResourceUrl {
	const parsed = new URL(url);
	if (parsed.protocol !== "pi-supervisor:") {
		throw new Error("Only pi-supervisor:// resource URLs are supported");
	}

	if (parsed.hostname === "sessions") {
		const parts = parsed.pathname.split("/").filter(Boolean);
		const sessionId = Number(parts[0]);
		if (!Number.isInteger(sessionId) || sessionId <= 0) {
			throw new Error(`Invalid session id in resource URL: ${url}`);
		}
		return {
			kind: "session",
			sessionId,
			resource: parts[1] ?? "summary",
		};
	}

	if (parsed.hostname === "agents") {
		const parts = parsed.pathname.split("/").filter(Boolean);
		const agentId = Number(parts[0]);
		if (!Number.isInteger(agentId) || agentId <= 0) {
			throw new Error(`Invalid agent id in resource URL: ${url}`);
		}
		const segment = parts[1] ?? "summary";
		if (segment === "skills" && parts[2]) {
			return {
				kind: "agent",
				agentId,
				resource: "skills",
				skillName: decodeURIComponent(parts[2]),
			};
		}
		if (segment === "prompts" && parts[2]) {
			return {
				kind: "agent",
				agentId,
				resource: "prompts",
				promptName: decodeURIComponent(parts[2]),
			};
		}
		return {
			kind: "agent",
			agentId,
			resource: segment,
		};
	}

	throw new Error(`Unsupported pi-supervisor resource host: ${parsed.hostname}`);
}
