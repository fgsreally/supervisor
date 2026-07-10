import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ExtensionContext } from "./types.js";

type ToolContent = Array<{ type: "text"; text: string } | { type: "image"; url: string }>;

export function registerAgentTool(
  ctx: ExtensionContext,
  tool: AgentTool,
  options?: { pausing?: boolean; pausingMessage?: string },
): void {
  ctx.agent.tools.register({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (params, context) => {
      const run = () => tool.execute(context.toolCallId, params, context.signal);
      const result = options?.pausing
        ? await ctx.session.pausing(options.pausingMessage ?? `${tool.name} waiting`, run)
        : await run();
      return result as {
        content: ToolContent;
        details?: unknown;
        isError?: boolean;
      };
    },
  });
}
