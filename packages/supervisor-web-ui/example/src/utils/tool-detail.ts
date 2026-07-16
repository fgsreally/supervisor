import {
  toolCallDetail,
  toolCallSummary,
  toolDetailLabel,
  toolResultDetail,
} from "../mock/tool-display";
import type { ToolDetailSection } from "../components/ToolDetailModal.vue";

export function buildToolModal(
  toolName: string,
  callArgs?: Record<string, unknown>,
  resultContent?: Array<{ type: string; text: string }>,
): { title: string; sections: ToolDetailSection[] } {
  const title = toolCallSummary(toolName, callArgs);
  const sections: ToolDetailSection[] = [];

  if (callArgs) {
    const call = toolCallDetail(toolName, callArgs);
    if (call) sections.push({ label: "调用参数", content: call });
  }
  if (resultContent?.length) {
    const result = toolResultDetail(resultContent);
    if (result) sections.push({ label: toolDetailLabel(toolName), content: result });
  }

  return { title, sections };
}

export function buildBashModal(
  command: string,
  resultContent?: Array<{ type: string; text: string }>,
  intent?: string,
): { title: string; sections: ToolDetailSection[] } {
  const sections: ToolDetailSection[] = [];
  if (intent?.trim()) sections.push({ label: "意图", content: intent.trim() });
  sections.push({ label: "命令", content: command });
  const output = toolResultDetail(resultContent);
  if (output) sections.push({ label: "终端输出", content: output });
  const title =
    intent?.trim() ||
    (() => {
      const oneLine = command.split("\n")[0];
      return oneLine.length > 48 ? `${oneLine.slice(0, 45)}...` : oneLine || "bash";
    })();
  return { title, sections };
}
