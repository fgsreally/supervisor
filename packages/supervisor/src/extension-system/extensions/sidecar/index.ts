import { type Static, Type } from "typebox";
import { defineExtension } from "../../define-extension.js";
import type { ExtensionContext, MemberAgentInfo } from "../../types.js";

const deliverSchema = Type.Object({
  message: Type.String({ minLength: 1, description: "Message to deliver back to the main agent." }),
  sourceAgentId: Type.Optional(
    Type.Number({ description: "Member agent id that produced the message." }),
  ),
  tag: Type.Optional(
    Type.String({ description: "Member tag to resolve sidecar agents. Default: sidecar." }),
  ),
});

type DeliverParams = Static<typeof deliverSchema>;

function pickSourceAgent(agents: MemberAgentInfo[], params: DeliverParams): MemberAgentInfo {
  if (params.sourceAgentId !== undefined) {
    const agent = agents.find((item) => item.id === params.sourceAgentId);
    if (!agent) {
      throw new Error(
        `Agent ${params.sourceAgentId} is not a member tagged '${params.tag ?? "sidecar"}'.`,
      );
    }
    return agent;
  }
  if (agents.length === 0) {
    throw new Error(
      `No member agents tagged '${params.tag ?? "sidecar"}' are configured for this session.`,
    );
  }
  if (agents.length > 1) {
    throw new Error("sourceAgentId is required when multiple sidecar-tagged agents exist.");
  }
  return agents[0]!;
}

async function deliverSidecarMessage(ctx: ExtensionContext, params: DeliverParams) {
  const tag = params.tag?.trim() || "sidecar";
  const agents = await ctx.session.members.byTag(tag);
  const sourceAgent = pickSourceAgent(agents, { ...params, tag });
  await ctx.session.pausing(`Deliver sidecar message from agent ${sourceAgent.id}`, () =>
    ctx.session.sendUserMessage(params.message, { source: String(sourceAgent.id) }),
  );
  return {
    sourceAgentId: sourceAgent.id,
    sourceAgentName: sourceAgent.name,
    tag,
  };
}

export default defineExtension({
  name: "sidecar",
  setup(ctx) {
    ctx.agent.tools.register({
      name: "sidecar_deliver",
      description:
        "Deliver a sidecar member agent result back to the main agent as a user message. " +
        "Sidecar agents are resolved from current session members by tag.",
      parameters: deliverSchema,
      async execute(params) {
        const details = await deliverSidecarMessage(ctx, params);
        return {
          content: [
            {
              type: "text",
              text: `Delivered sidecar message from agent ${details.sourceAgentId}.`,
            },
          ],
          details,
        };
      },
    });
  },
});
