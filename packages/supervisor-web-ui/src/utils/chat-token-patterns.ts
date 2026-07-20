export type ChatTokenKind = "file" | "skill" | "slash";

export interface ChatTokenRange {
  from: number;
  to: number;
  kind: ChatTokenKind;
  /** Raw token text e.g. @path or /skill:name */
  text: string;
}

const TOKEN_DELIMITERS = new Set([" ", "\t", "\n", '"', "'", "="]);

export function isTokenStart(text: string, index: number): boolean {
  return index === 0 || TOKEN_DELIMITERS.has(text[index - 1] ?? "");
}

function overlaps(ranges: ChatTokenRange[], from: number, to: number): boolean {
  return ranges.some((r) => from < r.to && to > r.from);
}

/** Find @file and /skill:name token spans for tag rendering. */
export function findChatTokens(text: string): ChatTokenRange[] {
  const ranges: ChatTokenRange[] = [];

  for (const match of text.matchAll(/@"[^"]*"/g)) {
    const from = match.index;
    if (from === undefined) continue;
    if (!isTokenStart(text, from)) continue;
    const tokenText = match[0];
    ranges.push({ from, to: from + tokenText.length, kind: "file", text: tokenText });
  }

  for (const match of text.matchAll(/@[^\s@]+/g)) {
    const from = match.index;
    if (from === undefined) continue;
    const tokenText = match[0];
    const to = from + tokenText.length;
    if (overlaps(ranges, from, to)) continue;
    if (!isTokenStart(text, from)) continue;
    ranges.push({ from, to, kind: "file", text: tokenText });
  }

  for (const match of text.matchAll(/\/skill:[\w-]+/g)) {
    const from = match.index;
    if (from === undefined) continue;
    if (!isTokenStart(text, from)) continue;
    const tokenText = match[0];
    const to = from + tokenText.length;
    if (overlaps(ranges, from, to)) continue;
    ranges.push({ from, to, kind: "skill", text: tokenText });
  }

  for (const match of text.matchAll(/\/[\w-]+/g)) {
    const from = match.index;
    if (from === undefined || !isTokenStart(text, from)) continue;
    const tokenText = match[0];
    const to = from + tokenText.length;
    if (overlaps(ranges, from, to)) continue;
    ranges.push({ from, to, kind: "slash", text: tokenText });
  }

  return ranges.sort((a, b) => a.from - b.from);
}
