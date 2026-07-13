import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { HindsightSessionState } from "../state.js";

const retainSchema = Type.Object({
  items: Type.Array(
    Type.Object({
      content: Type.String({ description: "information to remember" }),
      context: Type.Optional(Type.String({ description: "source context" })),
    }),
    { minItems: 1 },
  ),
});

export function createRetainTool(getState: () => HindsightSessionState | undefined): AgentTool {
  return {
    name: "retain",
    description:
      "Store important facts in long-term memory. Use for durable project knowledge, decisions, and preferences.",
    parameters: retainSchema,
    async execute(_id, params, signal): Promise<AgentToolResult> {
      const state = getState();
      if (!state) {
        throw new Error("Hindsight is not initialised for this session.");
      }
      if (signal?.aborted) throw new Error("Aborted");

      for (const item of params.items) {
        state.enqueueRetain(item.content, item.context);
      }
      await state.flushRetainQueue();

      const count = params.items.length;
      const noun = count === 1 ? "memory" : "memories";
      return {
        content: [{ type: "text", text: `${count} ${noun} stored.` }],
        details: { count },
      };
    },
  };
}
