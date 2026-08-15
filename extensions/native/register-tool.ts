import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentExtensionContext } from "pi-supervisor";

type ToolContent = Array<{ type: "text"; text: string } | { type: "image"; url: string }>;

export function registerNativeTool(ctx: AgentExtensionContext, tool: AgentTool): void {
  ctx.agent.registerTool({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (params, context) => {
      const result = await tool.execute(context.toolCallId, params, context.signal);
      return result as {
        content: ToolContent;
        details?: unknown;
        isError?: boolean;
      };
    },
  });
}
