/** Shared parsing for ask / questionnaire tool calls and results. */

export interface AskOption {
  value: string;
  label: string;
  description?: string;
}

export interface AskQuestion {
  id: string;
  label: string;
  prompt: string;
  options: AskOption[];
  allowOther?: boolean;
}

export interface AskAnswer {
  id: string;
  value: string;
  label: string;
  wasCustom?: boolean;
}

export interface AskResultDetails {
  questions?: AskQuestion[];
  answers?: AskAnswer[];
  cancelled?: boolean;
}

const ASK_TOOL_NAMES = new Set(["ask", "questionnaire", "AskUserQuestion"]);

export function isAskToolName(toolName: string): boolean {
  return ASK_TOOL_NAMES.has(toolName);
}

export function parseAskQuestions(callArgs?: Record<string, unknown>): AskQuestion[] {
  if (!callArgs) return [];
  const raw = callArgs.questions;
  if (!Array.isArray(raw)) return [];
  const out: AskQuestion[] = [];
  for (let index = 0; index < raw.length; index++) {
    const q = raw[index];
    if (!q || typeof q !== "object") continue;
    const item = q as Record<string, unknown>;
    const options: AskOption[] = [];
    if (Array.isArray(item.options)) {
      for (const opt of item.options) {
        if (!opt || typeof opt !== "object") continue;
        const o = opt as Record<string, unknown>;
        if (typeof o.value !== "string" || typeof o.label !== "string") continue;
        options.push({
          value: o.value,
          label: o.label,
          ...(typeof o.description === "string" ? { description: o.description } : {}),
        });
      }
    }
    if (!options.length || typeof item.prompt !== "string") continue;
    const id = typeof item.id === "string" ? item.id : `q${index + 1}`;
    out.push({
      id,
      label: typeof item.label === "string" ? item.label : `Q${index + 1}`,
      prompt: item.prompt,
      options,
      allowOther: item.allowOther !== false,
    });
  }
  return out;
}

export function parseAskResultDetails(
  resultContent?: Array<{ type: string; text: string }>,
): AskResultDetails | null {
  if (!resultContent?.length) return null;
  for (const part of resultContent) {
    if (part.type !== "text" || !part.text) continue;
    const text = part.text.trim();
    if (!text) continue;
    if (!text.startsWith("{") && !text.startsWith("[")) {
      return { answers: [{ id: "summary", value: text, label: text }] };
    }
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.details && typeof parsed.details === "object") {
        return parsed.details as AskResultDetails;
      }
      if (parsed.answers || parsed.cancelled !== undefined) {
        return parsed as AskResultDetails;
      }
    } catch {
      // not JSON
    }
  }
  return null;
}

export function normalizeAskToolResult(result: unknown): {
  content: Array<{ type: string; text: string }>;
  details?: AskResultDetails;
} {
  if (typeof result === "string") {
    try {
      return normalizeAskToolResult(JSON.parse(result));
    } catch {
      return { content: [{ type: "text", text: result }] };
    }
  }
  if (!result || typeof result !== "object") {
    const text = String(result ?? "");
    return { content: [{ type: "text", text }] };
  }
  const record = result as Record<string, unknown>;
  const details =
    record.details && typeof record.details === "object"
      ? (record.details as AskResultDetails)
      : undefined;
  const summary = askResultSummary(details ?? null);
  const contentFromResult = Array.isArray(record.content)
    ? (record.content as Array<{ type: string; text: string }>)
    : undefined;
  const text =
    contentFromResult?.find((p) => p.type === "text")?.text?.trim() || summary || "已回答";
  return {
    content: [{ type: "text", text }],
    ...(details ? { details } : {}),
  };
}

export function normalizeStreamingToolResult(
  toolName: string,
  result: unknown,
): { content: Array<{ type: string; text: string }>; details?: unknown } {
  if (isAskToolName(toolName)) {
    return normalizeAskToolResult(result);
  }
  if (typeof result === "string") {
    return { content: [{ type: "text", text: result }] };
  }
  if (result && typeof result === "object" && "content" in result) {
    const record = result as { content: unknown; details?: unknown };
    const content = Array.isArray(record.content)
      ? (record.content as Array<{ type: string; text: string }>)
      : [{ type: "text", text: JSON.stringify(result, null, 2) }];
    return {
      content,
      ...(record.details !== undefined ? { details: record.details } : {}),
    };
  }
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

export function parseAskResultFromToolResult(result: {
  content: Array<{ type: string; text: string }>;
  details?: unknown;
}): AskResultDetails | null {
  if (result.details && typeof result.details === "object") {
    const details = result.details as AskResultDetails;
    if (details.answers?.length || details.cancelled) return details;
  }
  return parseAskResultDetails(result.content);
}

export function askResultSummary(details: AskResultDetails | null): string {
  if (!details) return "";
  if (details.cancelled) return "已取消";
  if (!details.answers?.length) return "";
  return details.answers.map((a) => a.label).join(" · ");
}

export interface PendingAskInfo {
  toolCallId: string;
  prompt: string;
}

/** First unanswered ask tool call in rendered message groups. */
export function findPendingAskInDisplayGroups(
  groups: Array<{
    type: string;
    pieces?: Array<{
      kind: string;
      toolName?: string;
      callId?: string;
      callArgs?: Record<string, unknown>;
      result?: unknown;
    }>;
  }>,
): PendingAskInfo | null {
  for (const group of groups) {
    if (group.type !== "grouped_assistant" || !group.pieces) continue;
    for (const piece of group.pieces) {
      if (piece.kind !== "toolStep" || !piece.toolName || !piece.callId) continue;
      if (!isAskToolName(piece.toolName) || piece.result) continue;
      const questions = parseAskQuestions(piece.callArgs);
      return {
        toolCallId: piece.callId,
        prompt: questions[0]?.prompt ?? "请选择一项",
      };
    }
  }
  return null;
}
