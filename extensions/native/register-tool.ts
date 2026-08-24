import type { AgentExtensionContext } from "pi-supervisor";
import type { NativeTool } from "./tool-types.js";

export function registerNativeTool(ctx: AgentExtensionContext, tool: NativeTool): void {
  ctx.agent.registerTool({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (params, context) => {
      const result = await tool.execute(context.toolCallId, params, context.signal);
      return result as {
        content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>;
        details?: unknown;
        isError?: boolean;
      };
    },
  });
}
