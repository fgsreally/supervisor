import { Type } from "wecode";
import type { HindsightSessionState } from "../state.js";
import type { HindsightTool } from "../tool-types.js";

const recallSchema = Type.Object({
  query: Type.String({ description: "natural language search query" }),
});

export function createRecallTool(
  getState: () => HindsightSessionState | undefined,
): HindsightTool<typeof recallSchema, { count: number }> {
  return {
    name: "recall",
    description: "Search long-term memory for relevant prior context.",
    parameters: recallSchema,
    async execute(params, context) {
      const state = getState();
      if (!state) {
        throw new Error("Hindsight is not initialised for this session.");
      }
      if (context.signal?.aborted) throw new Error("Aborted");

      const { text, count } = await state.recallTool(params.query, context.signal);
      return {
        content: [{ type: "text", text }],
        details: { count },
        ...(count === 0 ? { useless: true } : {}),
      };
    },
  };
}
