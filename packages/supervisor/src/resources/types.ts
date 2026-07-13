export const RESOURCE_KINDS = ["extension", "skill", "prompt", "mcp", "tool"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export interface ResourceRow {
	id: number;
	kind: string;
	slug: string;
	name: string | null;
	description: string | null;
	source_path: string | null;
	version: string | null;
	meta: string;
	created_at: number;
	updated_at: number;
}

export interface Resource {
	id: number;
	kind: ResourceKind;
	slug: string;
	name: string | null;
	description: string | null;
	sourcePath: string | null;
	version: string | null;
	meta: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date;
}

export interface AgentResourceRow {
	id: number;
	agent_id: number;
	resource_id: number;
	enabled: number;
	priority: number;
	created_at: number;
}

export interface AgentResourceBinding {
	id: number;
	agentId: number;
	resourceId: number;
	enabled: boolean;
	priority: number;
	createdAt: Date;
	resource?: Resource;
}

export function isResourceKind(value: string): value is ResourceKind {
	return (RESOURCE_KINDS as readonly string[]).includes(value);
}
