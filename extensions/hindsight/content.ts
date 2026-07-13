/**
 * Pure content utilities for Hindsight retain/recall.
 */

export interface HindsightMessage {
  role: string;
  content: string;
}

export interface RecallResultLike {
  text: string;
  type?: string | null;
  mentioned_at?: string | null;
}

const MEMORIES_REGEX = /<memories>[\s\S]*?<\/memories>/g;
const MENTAL_MODELS_REGEX = /<mental_models>[\s\S]*?<\/mental_models>/g;

const SUBSTANTIVE_CHAR_RE = /[\p{L}\p{N}]/u;

export function stripMemoryTags(content: string): string {
  return content.replace(MEMORIES_REGEX, "").replace(MENTAL_MODELS_REGEX, "");
}

export function hasSubstantiveContent(content: string): boolean {
  return SUBSTANTIVE_CHAR_RE.test(content);
}

export function formatMemories(results: RecallResultLike[]): string {
  if (results.length === 0) return "";
  return results
    .map((r) => {
      const typeStr = r.type ? ` [${r.type}]` : "";
      const dateStr = r.mentioned_at ? ` (${r.mentioned_at})` : "";
      return `- ${r.text}${typeStr}${dateStr}`;
    })
    .join("\n\n");
}

export function formatCurrentTime(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}

export function sliceLastTurnsByUserBoundary(messages: HindsightMessage[], turns: number): HindsightMessage[] {
  if (messages.length === 0 || turns <= 0) return [];

  let userTurnsSeen = 0;
  let startIndex = -1;

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "user") {
      userTurnsSeen += 1;
      if (userTurnsSeen >= turns) {
        startIndex = i;
        break;
      }
    }
  }

  return startIndex === -1 ? [...messages] : messages.slice(startIndex);
}

export function composeRecallQuery(
  latestQuery: string,
  messages: HindsightMessage[],
  recallContextTurns: number,
): string {
  const latest = latestQuery.trim();
  if (recallContextTurns <= 1 || messages.length === 0) return latest;

  const contextual = sliceLastTurnsByUserBoundary(messages, recallContextTurns);
  const contextLines: string[] = [];

  for (const msg of contextual) {
    const content = stripMemoryTags(msg.content).trim();
    if (!content) continue;
    if (msg.role === "user" && content === latest) continue;
    contextLines.push(`${msg.role}: ${content}`);
  }

  if (contextLines.length === 0) return latest;
  return ["Prior context:", contextLines.join("\n"), latest].join("\n\n");
}

export function truncateRecallQuery(query: string, latestQuery: string, maxChars: number): string {
  if (maxChars <= 0 || query.length <= maxChars) return query;

  const latest = latestQuery.trim();
  const latestOnly = latest.length > maxChars ? latest.slice(0, maxChars) : latest;

  if (!query.includes("Prior context:")) return latestOnly;

  const contextMarker = "Prior context:\n\n";
  const markerIndex = query.indexOf(contextMarker);
  if (markerIndex === -1) return latestOnly;

  const suffix = `\n\n${latest}`;
  const suffixIndex = query.lastIndexOf(suffix);
  if (suffixIndex === -1) return latestOnly;
  if (suffix.length >= maxChars) return latestOnly;

  const contextBody = query.slice(markerIndex + contextMarker.length, suffixIndex);
  const contextLines = contextBody.split("\n").filter(Boolean);

  const kept: string[] = [];
  for (let i = contextLines.length - 1; i >= 0; i--) {
    kept.unshift(contextLines[i]!);
    const candidate = `${contextMarker}${kept.join("\n")}${suffix}`;
    if (candidate.length > maxChars) {
      kept.shift();
      break;
    }
  }

  if (kept.length > 0) return `${contextMarker}${kept.join("\n")}${suffix}`;
  return latestOnly;
}

export interface RetentionTranscript {
  transcript: string | null;
  messageCount: number;
}

function formatRetentionMessages(messages: HindsightMessage[]): RetentionTranscript {
  const parts: string[] = [];
  for (const msg of messages) {
    const content = stripMemoryTags(msg.content).trim();
    if (!hasSubstantiveContent(content)) continue;
    parts.push(`[role: ${msg.role}]\n${content}\n[${msg.role}:end]`);
  }

  if (parts.length === 0) return { transcript: null, messageCount: 0 };

  const transcript = parts.join("\n\n");
  if (transcript.trim().length < 10) return { transcript: null, messageCount: 0 };

  return { transcript, messageCount: parts.length };
}

export function prepareRetentionTranscript(
  messages: HindsightMessage[],
  retainFullWindow = false,
): RetentionTranscript {
  if (messages.length === 0) return { transcript: null, messageCount: 0 };

  let targetMessages: HindsightMessage[];
  if (retainFullWindow) {
    targetMessages = messages;
  } else {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return { transcript: null, messageCount: 0 };
    targetMessages = messages.slice(lastUserIdx);
  }

  return formatRetentionMessages(targetMessages);
}

export function formatMemoriesBlock(
  preamble: string,
  formattedResults: string,
): string {
  return `<memories>\n${preamble}\nCurrent time: ${formatCurrentTime()} UTC\n\n${formattedResults}\n</memories>`;
}
