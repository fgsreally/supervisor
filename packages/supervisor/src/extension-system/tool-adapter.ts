import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolInfo } from "./types.js";
import { ExtensionRuntime } from "./runtime.js";

/**
 * Convert an extension ToolInfo into an AgentTool for the AgentHarness.
 * The execute call is forwarded to ExtensionRuntime.executeTool().
 */
export function toolInfoToAgentTool(info: ToolInfo, runtime: ExtensionRuntime): AgentTool {
  return {
    name: info.name,
    label: info.name,
    description: info.description,
    parameters: info.parameters,
    async execute(toolCallId: string, params: unknown, signal?: AbortSignal, _onUpdate?: unknown) {
      const result = await runtime.executeTool(info.name, params, {
        toolCallId,
        session: runtime.getToolExecutionSession(),
        signal,
        reportProgress: () => {},
      });
      return result as any;
    },
  };
}

export function wrapToolWithExtensionRuntime(
  tool: AgentTool,
  runtime: ExtensionRuntime,
): AgentTool {
  const execute = tool.execute.bind(tool);
  return {
    ...tool,
    async execute(toolCallId: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown) {
      const blocked = await runtime.checkToolBeforeCall(toolCallId, tool.name, params);
      if (blocked.block) {
        return {
          content: [{ type: "text", text: blocked.reason ?? "Tool call blocked." }],
          isError: true,
        } as Awaited<ReturnType<AgentTool["execute"]>>;
      }

      const result = await execute(toolCallId, params, signal, onUpdate as never);
      let transformed: unknown = result;
      await runtime.emit({
        type: "tool.after_call",
        toolCallId,
        name: tool.name,
        args: params,
        result: {
          content: Array.isArray((result as { content?: unknown }).content)
            ? (result as { content: Array<{ type: string; text?: string }> }).content
            : [],
          isError: Boolean((result as { isError?: boolean }).isError),
          duration: 0,
          details: (result as { details?: unknown }).details,
        },
        entryId: "",
        setResult: (next: unknown) => {
          transformed = next;
        },
      });
      await runtime.runToolAfterHandlers(toolCallId, tool.name, params, transformed, (next) => {
        transformed = next;
      });
      return transformed as Awaited<ReturnType<AgentTool["execute"]>>;
    },
  };
}
