import { defineExtension } from "../../define-extension.js";
import { Type, type Static } from "../../schema.js";
import {
  DEFAULT_PARENT_MESSAGE_LEVEL,
  SESSION_INPUT_INTERRUPT_LEVEL,
} from "../../../core/session-input-queue.js";

const sendParentMsgSchema = Type.Object({
  message: Type.String({
    minLength: 1,
    description: "Message to enqueue for the parent session.",
  }),
  level: Type.Optional(
    Type.Number({
      description:
        "Queue priority level. Higher values are delivered before lower ones " +
        `(default: ${DEFAULT_PARENT_MESSAGE_LEVEL}). ` +
        `At ${SESSION_INPUT_INTERRUPT_LEVEL}+ the parent turn is interrupted immediately.`,
    }),
  ),
});

type SendParentMsgParams = Static<typeof sendParentMsgSchema>;

export default defineExtension({
  name: "shadow-child",
  setup(ctx) {
    const shadowBanReason = "Shadow sessions cannot modify files.";
    ctx.session.tools.disable("edit", shadowBanReason);
    ctx.session.tools.disable("write", shadowBanReason);

    ctx.agent.registerTool({
      name: "send_parent_msg",
      description:
        "Enqueue a message for the parent session. Use level to order against other " +
        "queued inputs (user follow-ups, other shadow messages). Higher level wins. " +
        `Level ${SESSION_INPUT_INTERRUPT_LEVEL}+ aborts the active parent turn.`,
      parameters: sendParentMsgSchema,
      async execute(params: SendParentMsgParams) {
        const level = params.level ?? DEFAULT_PARENT_MESSAGE_LEVEL;
        await ctx.session.sendParentMsg(params.message, { level });
        return {
          content: [{ type: "text", text: `Enqueued parent message (level: ${level}).` }],
          details: { level },
        };
      },
    });
  },
});
