import type { AgentPluginContext, ToolDefinition } from "wecode";

export function registerHindsightTool(
  ctx: AgentPluginContext,
  tool: ToolDefinition<any, any>,
): void {
  ctx.agent.registerTool(tool);
}
