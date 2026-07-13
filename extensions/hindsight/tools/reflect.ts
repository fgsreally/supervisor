import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { HindsightSessionState } from "../state.js";

const reflectSchema = Type.Object({
  query: Type.String({ description: "question to answer" }),
  context: Type.Optional(Type.String({ description: "optional context" })),
});

export function createReflectTool(getState: () => HindsightSessionState | undefined): AgentTool {
  return {
    name: "reflect",
    description: "Synthesize an answer from long-term memory.",
    parameters: reflectSchema,
    async execute(_id, params, signal): Promise<AgentToolResult> {
      const state = getState();
      if (!state) {
        throw new Error("Hindsight is not initialised for this session.");
      }
      if (signal?.aborted) throw new Error("Aborted");

      const text = await state.reflectTool(params.query, params.context, signal);
      return {
        content: [{ type: "text", text }],
        details: {},
      };
    },
  };
}
