import type { AgentExtensionContext, ToolDefinition } from "pi-supervisor";

export function registerHindsightTool(
  ctx: AgentExtensionContext,
  tool: ToolDefinition<any, any>,
): void {
  ctx.agent.registerTool(tool);
}
