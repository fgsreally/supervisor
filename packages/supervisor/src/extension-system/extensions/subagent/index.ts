import { type Static, Type } from "typebox";
import { defineExtension } from "../../define-extension.js";
import type { ExtensionContext } from "../../types.js";

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
    description: "pi-supervisor resource URL, for example pi-supervisor://sessions/34/messages",
  }),
  limit: Type.Optional(Type.Number({ description: "Maximum rows for list resources." })),
});

const resourceUrls = (sessionId: number) => ({
  resultUrl: `pi-supervisor://sessions/${sessionId}/result`,
  messagesUrl: `pi-supervisor://sessions/${sessionId}/messages`,
  traceUrl: `pi-supervisor://sessions/${sessionId}/branch`,
});

type SpawnAgentParams = Static<typeof spawnAgentSchema>;
type ReadResourceParams = Static<typeof readResourceSchema>;

function parseSupervisorResourceUrl(url: string): { sessionId: number; resource: string } {
  const parsed = new URL(url);
  if (parsed.protocol !== "pi-supervisor:") {
    throw new Error("Only pi-supervisor:// resource URLs are supported");
  }
  if (parsed.hostname !== "sessions") {
    throw new Error("Only pi-supervisor://sessions/:id resources are supported");
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  const sessionId = Number(parts[0]);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new Error(`Invalid session id in resource URL: ${url}`);
  }
  return { sessionId, resource: parts[1] ?? "summary" };
}

async function assertCanReadSession(ctx: ExtensionContext, sessionId: number): Promise<void> {
  if (sessionId === ctx.session.id) return;
  const children = await ctx.session.children();
  if (children.some((child) => child.id === sessionId)) return;
  throw new Error(`Session ${sessionId} is not readable from session ${ctx.session.id}`);
}

function parsePayloadText(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

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
      name: "read_supervisor_resource",
      description:
        "Read a pi-supervisor resource URL returned by spawn_agent. " +
        "Only the current session and its direct child sessions are readable.",
      parameters: readResourceSchema,
      async execute(params: ReadResourceParams) {
        const { sessionId, resource } = parseSupervisorResourceUrl(params.url);
        await assertCanReadSession(ctx, sessionId);
        const sqlite = ctx.system.db.sqlite;
        if (!sqlite) {
          throw new Error("SQLite resource access is not available in this runtime");
        }
        const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
        if (resource === "messages" || resource === "branch") {
          const rows = sqlite
            .prepare(
              `SELECT entry_id, type, message_role, payload, created_at
             FROM messages
             WHERE session_id = ?
             ORDER BY created_at ASC
             LIMIT ?`,
            )
            .all(sessionId, limit) as Array<{
            entry_id: string;
            type: string;
            message_role: string | null;
            payload: string;
            created_at: number;
          }>;
          const result = rows.map((row) => ({
            entryId: row.entry_id,
            type: row.type,
            role: row.message_role,
            payload: parsePayloadText(row.payload),
            createdAt: row.created_at,
          }));
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            details: result,
          };
        }
        if (resource === "result" || resource === "summary") {
          const row = sqlite
            .prepare(
              `SELECT payload, created_at
             FROM messages
             WHERE session_id = ? AND message_role = 'assistant'
             ORDER BY created_at DESC
             LIMIT 1`,
            )
            .get(sessionId) as { payload?: string; created_at?: number } | undefined;
          const result = {
            sessionId,
            payload: row?.payload ? parsePayloadText(row.payload) : null,
            createdAt: row?.created_at ?? null,
          };
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            details: result,
          };
        }
        throw new Error(`Unsupported pi-supervisor session resource: ${resource}`);
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
