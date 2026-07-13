import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { HindsightSessionState } from "../state.js";

const recallSchema = Type.Object({
  query: Type.String({ description: "natural language search query" }),
});

export function createRecallTool(getState: () => HindsightSessionState | undefined): AgentTool {
  return {
    name: "recall",
    description: "Search long-term memory for relevant prior context.",
    parameters: recallSchema,
    async execute(_id, params, signal): Promise<AgentToolResult> {
      const state = getState();
      if (!state) {
        throw new Error("Hindsight is not initialised for this session.");
      }
      if (signal?.aborted) throw new Error("Aborted");

      const { text, count } = await state.recallTool(params.query, signal);
      return {
        content: [{ type: "text", text }],
        details: { count },
        ...(count === 0 ? { useless: true } : {}),
      } as AgentToolResult;
    },
  };
}
