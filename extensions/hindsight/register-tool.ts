import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { defineExtension } from "@earendil-works/pi-supervisor";

type ExtensionContext = Parameters<Parameters<typeof defineExtension>[0]["setup"]>[0];

type ToolContent = Array<{ type: "text"; text: string } | { type: "image"; url: string }>;

export function registerHindsightTool(ctx: ExtensionContext, tool: AgentTool): void {
  ctx.agent.tools.register({
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
