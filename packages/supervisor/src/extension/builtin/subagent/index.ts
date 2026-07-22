import { Type, type Static } from "typebox";
import type { ExtensionContext, ExtensionDefinition } from "../../types.js";

const spawnAgentSchema = Type.Object({
  sessionId: Type.Optional(
    Type.Number({
      description: "Existing spawned child Session to continue instead of creating a new one.",
    }),
  ),
  agentName: Type.Optional(
    Type.String({
      description: "Name of the spawned member Agent to use when creating a child Session.",
    }),
  ),
  urgency: Type.Optional(
    Type.Union([Type.Literal("normal"), Type.Literal("urgent")], {
      description:
        "For session continuation: normal queues behind the current turn; urgent interrupts it.",
      default: "normal",
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

type SpawnAgentParams = Static<typeof spawnAgentSchema>;

function pickAgent(
  agents: Awaited<ReturnType<ExtensionContext["agent"]["findByRole"]>>,
  params: SpawnAgentParams,
) {
  const agentName = params.agentName?.trim();
  if (agentName) {
    const matches = agents.filter((agent) => agent.name === agentName);
    if (matches.length > 1) {
      throw new Error(`Multiple spawned members are named '${agentName}'; rename them uniquely`);
    }
    return matches[0];
  }
  throw new Error("spawn_agent requires agentName when sessionId is not provided");
}

export default {
  name: "subagent",
  async setup(ctx) {
    const configuredAgents = await ctx.agent.findByRole("spawned");
    const configuredNames = configuredAgents.map((agent) => agent.name).join(", ");
    ctx.agent.registerTool({
      name: "spawn_agent",
      description:
        "Create or continue a delegated subagent Session. Pass sessionId to continue an existing " +
        "child Session; otherwise select a spawned member by agentName. For continuation, urgency " +
        "normal queues the message and urgent interrupts the child's current turn." +
        (configuredNames ? ` Available agentName values: ${configuredNames}.` : ""),
      parameters: spawnAgentSchema,
      async execute(params: SpawnAgentParams) {
        const instructions = (params.prompt ?? params.instructions ?? "").trim();
        if (!instructions) {
          throw new Error("spawn_agent requires prompt or instructions");
        }

        if (params.sessionId !== undefined) {
          await ctx.session.sendToChild(params.sessionId, instructions, {
            source: `spawn_agent:parent:${ctx.session.id}`,
            background: params.run_in_background,
            urgency: params.urgency ?? "normal",
          });
          const resumed = {
            sessionId: params.sessionId,
            parentId: ctx.session.id,
            status: params.run_in_background ? "accepted" : "idle",
            resumed: true,
            description: params.description,
          };
          if (params.run_in_background) {
            return {
              content: [{ type: "text", text: JSON.stringify(resumed) }],
              details: resumed,
            };
          }

          const summary = await ctx.session.waitForResult(params.sessionId, {
            timeoutMs: params.timeoutMs,
            maxChars: params.maxResultChars,
          });
          if (params.finish_on_result) await ctx.session.finish(params.sessionId);
          const details = {
            ...resumed,
            status: summary.status,
            result: summary.result,
            truncated: summary.truncated,
          };
          return {
            content: [{ type: "text", text: JSON.stringify(details) }],
            details,
          };
        }

        const allowedAgents = await ctx.agent.findByRole("spawned");
        const allowedAgent = pickAgent(allowedAgents, params);
        if (!allowedAgent) {
          const available = allowedAgents.map((agent) => agent.name).join(", ") || "none";
          throw new Error(
            params.agentName?.trim()
              ? `Agent '${params.agentName.trim()}' is not a spawned member of session ${ctx.session.id}; available: ${available}`
              : `spawn_agent requires agentName; available: ${available}`,
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
              agentName: allowedAgent.name,
              description: params.description,
              mode: params.run_in_background ? "background" : "foreground",
              finishOnResult: params.finish_on_result ?? false,
            },
          },
        });
        if (params.run_in_background) {
          const details = { ...result, description: params.description };
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
          description: params.description,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(details) }],
          details,
        };
      },
    });
    ctx.agent.registerTool({
      name: "get_subagent_status",
      description:
        "Inspect the latest execution state and latest assistant output of a direct spawned child Session.",
      parameters: Type.Object({
        sessionId: Type.Number({ description: "Child Session ID returned by spawn_agent." }),
        maxResultChars: Type.Optional(
          Type.Number({ description: "Maximum latest-result characters to return." }),
        ),
      }),
      async execute(params) {
        const details = await ctx.session.inspectChild(params.sessionId, {
          maxChars: params.maxResultChars,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(details) }],
          details,
        };
      },
    });
  },
} satisfies ExtensionDefinition;
