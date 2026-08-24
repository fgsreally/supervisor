import { Type } from "pi-supervisor";
import type { HindsightSessionState } from "../state.js";
import type { HindsightTool } from "../tool-types.js";

const reflectSchema = Type.Object({
  query: Type.String({ description: "question to answer" }),
  context: Type.Optional(Type.String({ description: "optional context" })),
});

export function createReflectTool(
  getState: () => HindsightSessionState | undefined,
): HindsightTool<typeof reflectSchema, Record<string, never>> {
  return {
    name: "reflect",
    description: "Synthesize an answer from long-term memory.",
    parameters: reflectSchema,
    async execute(params, context) {
      const state = getState();
      if (!state) {
        throw new Error("Hindsight is not initialised for this session.");
      }
      if (context.signal?.aborted) throw new Error("Aborted");

      const text = await state.reflectTool(params.query, params.context, context.signal);
      return {
        content: [{ type: "text", text }],
        details: {},
      };
    },
  };
}
