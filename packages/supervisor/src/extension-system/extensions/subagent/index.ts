import { type Static, Type } from "typebox";
import { defineExtension } from "../../define-extension.js";
import type { ExtensionContext } from "../../types.js";
import {
	listSupervisorResources,
	readSupervisorResource,
	sessionResourceUrl,
} from "../../../supervisor-resources/index.js";

const spawnAgentSchema = Type.Object({
	subagent_type: Type.Optional(
		Type.String({
			description: "Type/tag of a spawned member agent, for example 'review' or 'explore'.",
		}),
	),
	agentId: Type.Optional(
		Type.Number({
			description: "ID of a member agent whose role is 'spawned'. Prefer subagent_type.",
		}),
	),
	description: Type.Optional(
		Type.String({
			description: "Short UI/log description for this delegated task.",
		}),
	),
	prompt: Type.Optional(
		Type.String({
			minLength: 1,
			description: "Task instructions for the child agent session.",
		}),
	),
	instructions: Type.Optional(
		Type.String({
			minLength: 1,
			description: "Alias for prompt.",
		}),
	),
	run_in_background: Type.Optional(
		Type.Boolean({
			description: "Return immediately after starting the child session.",
		}),
	),
	finish_on_result: Type.Optional(
		Type.Boolean({
			description: "Mark the child session archived after a foreground result is collected.",
		}),
	),
	timeoutMs: Type.Optional(
		Type.Number({
			description: "Foreground wait timeout in milliseconds.",
		}),
	),
	maxResultChars: Type.Optional(
		Type.Number({
			description: "Maximum foreground result characters returned to parent.",
		}),
	),
	systemPrompt: Type.Optional(
		Type.String({
			description: "Optional system prompt override for the child agent.",
		}),
	),
	meta: Type.Optional(
		Type.Record(Type.String(), Type.Unknown(), {
			description: "Optional metadata attached to the child session.",
		}),
	),
});

const readResourceSchema = Type.Object({
	url: Type.String({
		description:
			"pi-supervisor resource URL, for example pi-supervisor://sessions/34/messages or pi-supervisor://agents/7/skills/deploy",
	}),
	limit: Type.Optional(Type.Number({ description: "Maximum rows for list resources." })),
});

const listResourcesSchema = Type.Object({
	kind: Type.Optional(
		Type.String({
			description:
				"Optional filter by resource kind prefix, e.g. skill, session-child, shadow-member.",
		}),
	),
});

type SpawnAgentParams = Static<typeof spawnAgentSchema>;
type ReadResourceParams = Static<typeof readResourceSchema>;
type ListResourcesParams = Static<typeof listResourcesSchema>;

const resourceUrls = (sessionId: number) => ({
	resultUrl: sessionResourceUrl(sessionId, "result"),
	messagesUrl: sessionResourceUrl(sessionId, "messages"),
	traceUrl: sessionResourceUrl(sessionId, "branch"),
});

function pickAgent(
	agents: Awaited<ReturnType<ExtensionContext["session"]["members"]["byRole"]>>,
	params: SpawnAgentParams,
) {
	if (params.agentId !== undefined) {
		return agents.find((agent) => agent.id === params.agentId);
	}
	const type = params.subagent_type?.trim();
	if (!type) {
		throw new Error("spawn_agent requires subagent_type or agentId");
	}
	return agents.find((agent) => agent.tags.includes(type));
}

export default defineExtension({
	name: "subagent",
	setup(ctx) {
		ctx.agent.tools.register({
			name: "list_supervisor_resources",
			description:
				"List pi-supervisor:// resources the current agent can read in this session " +
				"(skills, prompts, child sessions, shadow collaborators, spawned members). " +
				"Use read_supervisor_resource with a returned url to fetch content.",
			parameters: listResourcesSchema,
			async execute(params: ListResourcesParams) {
				const catalog = await listSupervisorResources(ctx);
				const kind = params.kind?.trim();
				const resources = kind
					? catalog.resources.filter((entry) => entry.kind.startsWith(kind))
					: catalog.resources;
				const result = { ...catalog, resources };
				return {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
					details: result,
				};
			},
		});

		ctx.agent.tools.register({
			name: "read_supervisor_resource",
			description:
				"Read a pi-supervisor:// resource URL. Supports session messages/results, agent skills/prompts, " +
				"and agent summaries. Only the current session, its children, and linked member agents are readable.",
			parameters: readResourceSchema,
			async execute(params: ReadResourceParams) {
				const result = await readSupervisorResource(ctx, params.url, { limit: params.limit });
				return {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
					details: result,
				};
			},
		});

		ctx.agent.tools.register({
			name: "spawn_agent",
			description:
				"Spawn or run a delegated subagent session from current session members. " +
				"Prefer subagent_type over raw agentId. Only role='spawned' members can be used.",
			parameters: spawnAgentSchema,
			async execute(params: SpawnAgentParams) {
				const instructions = (params.prompt ?? params.instructions ?? "").trim();
				if (!instructions) {
					throw new Error("spawn_agent requires prompt or instructions");
				}
				const allowedAgents = await ctx.session.members.byRole("spawned");
				const allowedAgent = pickAgent(allowedAgents, params);
				if (!allowedAgent) {
					throw new Error(
						params.agentId !== undefined
							? `Agent ${params.agentId} is not a spawned member of session ${ctx.session.id}`
							: `No spawned member matches subagent_type '${params.subagent_type}' in session ${ctx.session.id}`,
					);
				}
				const result = await ctx.session.spawn({
					parentId: ctx.session.id,
					agentId: allowedAgent.id,
					instructions,
					systemPrompt: params.systemPrompt,
					meta: {
						...(params.meta as Record<string, unknown> | undefined),
						spawnedBy: "spawn_agent",
						parentSessionId: ctx.session.id,
						subagent: {
							type: params.subagent_type ?? "agent",
							description: params.description,
							mode: params.run_in_background ? "background" : "foreground",
							finishOnResult: params.finish_on_result ?? false,
						},
					},
				});
				const urls = resourceUrls(result.sessionId);

				if (params.run_in_background) {
					const details = { ...result, ...urls, description: params.description };
					return {
						content: [{ type: "text", text: JSON.stringify(details) }],
						details,
					};
				}

				const summary = await ctx.session.waitForResult(result.sessionId, {
					timeoutMs: params.timeoutMs,
					maxChars: params.maxResultChars,
				});
				if (params.finish_on_result) {
					await ctx.session.finish(result.sessionId);
				}
				const details = {
					...result,
					status: summary.status,
					result: summary.result,
					truncated: summary.truncated,
					...urls,
					description: params.description,
				};
				return {
					content: [{ type: "text", text: JSON.stringify(details) }],
					details,
				};
			},
		});
	},
});
