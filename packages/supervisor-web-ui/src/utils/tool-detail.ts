import type { ToolDetailSection } from "../components/tool/ToolDetailModal.vue";
import { toolCallDetail, toolCallSummary, toolDetailLabel, toolResultDetail } from "./tool-display";
import { translate as t } from "@/i18n";

export function buildToolModal(
  toolName: string,
  callArgs?: Record<string, unknown>,
  resultContent?: Array<{ type: string; text: string }>,
): { title: string; sections: ToolDetailSection[] } {
  const title = toolCallSummary(toolName, callArgs);
  const sections: ToolDetailSection[] = [];

  if (callArgs) {
    const call = toolCallDetail(toolName, callArgs);
    if (call) sections.push({ label: t("toolDetail.arguments"), content: call });
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
  if (intent?.trim()) sections.push({ label: t("toolDetail.intent"), content: intent.trim() });
  sections.push({ label: t("toolDetail.command"), content: command });
  const output = toolResultDetail(resultContent);
  if (output) sections.push({ label: t("toolDetail.terminalOutput"), content: output });
  const title =
    intent?.trim() ||
    (() => {
      const oneLine = command.split("\n")[0];
      return oneLine.length > 48 ? `${oneLine.slice(0, 45)}...` : oneLine || "bash";
    })();
  return { title, sections };
}

export function buildExternalInteractionModal(
  callArgs?: Record<string, unknown>,
  resultContent?: Array<{ type: string; text: string }>,
): { title: string; sections: ToolDetailSection[] } {
  const title =
    typeof callArgs?.title === "string" && callArgs.title.trim()
      ? callArgs.title.trim()
      : t("toolDetail.externalRequest");
  const sections: ToolDetailSection[] = [];

  const detail = typeof callArgs?.detail === "string" ? callArgs.detail.trim() : "";
  if (detail) sections.push({ label: t("toolDetail.summary"), content: detail });

  const request = callArgs?.request;
  if (request && typeof request === "object") {
    try {
      sections.push({
        label: t("toolDetail.requestDetails"),
        content: JSON.stringify(request, null, 2),
      });
    } catch {
      sections.push({ label: t("toolDetail.requestDetails"), content: String(request) });
    }
  }

  const result = toolResultDetail(resultContent);
  if (result) sections.push({ label: t("toolDetail.result"), content: result });

  if (sections.length === 0) {
    sections.push({ label: t("toolDetail.details"), content: t("toolDetail.noAdditionalInfo") });
  }

  return { title, sections };
}
