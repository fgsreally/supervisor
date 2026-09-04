import type { LogEntry } from "@/api";

/** Parse ISO-prefixed plain log text (watson / system) into session-style entries. */
export function parsePlainLogText(text: string): LogEntry[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    let t = Date.now() - (lines.length - index) * 1000;
    let rest = line;
    const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\S+)\s+(.*)$/);
    if (tsMatch) {
      const parsed = Date.parse(tsMatch[1]!);
      if (Number.isFinite(parsed)) t = parsed;
      rest = tsMatch[2] ?? "";
    }

    const tags: string[] = [];
    let level: LogEntry["l"] = "info";
    let message = rest;

    const tagMatch = rest.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (tagMatch) {
      const tag = tagMatch[1]!.trim().toLowerCase();
      tags.push(tag);
      message = (tagMatch[2] ?? "").trim() || rest;
      if (tag === "error" || tag === "err" || tag === "fail" || tag === "failed") level = "error";
      else if (tag === "warn" || tag === "warning") level = "warn";
      else if (tag === "debug" || tag === "trace") level = "debug";
      else level = "info";
    } else if (/\berror\b/i.test(rest) || /\bfailed\b/i.test(rest)) {
      level = "error";
      tags.push("error");
    }

    const kind = message.match(/\bkind=([^\s]+)/i);
    if (kind?.[1] && !tags.includes(kind[1])) tags.push(kind[1]);

    return {
      t,
      l: level,
      m: message || rest || line,
      tags: tags.length ? tags : undefined,
    };
  });
}
