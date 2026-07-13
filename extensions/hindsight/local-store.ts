import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const HINDSIGHT_FILE = "hindsight.jsonl";
const DEFAULT_RECALL_LIMIT = 15;

export interface HindsightRecord {
  id: string;
  sessionId: string;
  content: string;
  tags: string[];
  source: string | null;
  createdAt: number;
}

function hindsightPath(projectDir: string): string {
  return join(projectDir, HINDSIGHT_FILE);
}

export function formatHindsightBlock(
  records: Array<{ content: string; source: string | null; createdAt: number }>,
): string {
  if (records.length === 0) return "";

  const lines: string[] = ["<memories>"];
  for (const record of records) {
    const date = new Date(record.createdAt).toISOString().slice(0, 10);
    lines.push(`  [${date}] ${record.content}`);
  }
  lines.push("</memories>");
  return lines.join("\n");
}

function parseHindsightLine(line: string): HindsightRecord | null {
  try {
    const record = JSON.parse(line) as Partial<HindsightRecord>;
    if (
      typeof record.id !== "string" ||
      typeof record.sessionId !== "string" ||
      typeof record.content !== "string" ||
      typeof record.createdAt !== "number"
    ) {
      return null;
    }
    return {
      id: record.id,
      sessionId: record.sessionId,
      content: record.content,
      tags: Array.isArray(record.tags)
        ? record.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      source: typeof record.source === "string" ? record.source : null,
      createdAt: record.createdAt,
    };
  } catch {
    return null;
  }
}

async function appendHindsightRecord(projectDir: string, record: HindsightRecord): Promise<void> {
  const filePath = hindsightPath(projectDir);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf-8");
}

export function listHindsightRecords(
  projectDir: string,
  limit = DEFAULT_RECALL_LIMIT,
): HindsightRecord[] {
  const filePath = hindsightPath(projectDir);
  if (!existsSync(filePath)) return [];
  const records = readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseHindsightLine)
    .filter((record): record is HindsightRecord => record !== null);
  return records.toSorted((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

function extractTextBlocks(messages: unknown[]): string[] {
  const texts: string[] = [];
  for (const message of messages) {
    const item = message as { role?: unknown; content?: unknown };
    if (item.role !== "assistant" || item.content === undefined) continue;
    const blocks = Array.isArray(item.content) ? item.content : [item.content];
    for (const block of blocks) {
      if (typeof block === "string") {
        texts.push(block);
      } else if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
      ) {
        texts.push((block as { text: string }).text);
      }
    }
  }
  return texts;
}

function extractFacts(messages: unknown[]): string[] {
  const facts: string[] = [];
  for (const text of extractTextBlocks(messages)) {
    if (text.length <= 20 || text.includes("read_pattern") || text.includes("edit path=")) {
      continue;
    }

    const sentences = text
      .split(/[.;\n]/)
      .map((sentence) => sentence.trim())
      .filter(
        (sentence) =>
          sentence.length > 10 &&
          sentence.length < 200 &&
          !/^[A-Z][a-z]+ed\b/.test(sentence) &&
          !/^(I've applied|Updated|No changes|Tip:|Use)/.test(sentence),
      );
    facts.push(...sentences);
  }
  return facts;
}

export async function extractFactsFromMessages(
  messages: unknown[],
  projectDir: string,
  sessionId: string | number,
): Promise<number> {
  if (messages.length === 0) return 0;

  const seen = new Set<string>();
  const writes: Promise<void>[] = [];
  for (const fact of extractFacts(messages)) {
    const key = fact.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    writes.push(
      appendHindsightRecord(projectDir, {
        id: randomUUID(),
        sessionId: String(sessionId),
        content: fact,
        tags: ["auto"],
        source: "session_auto",
        createdAt: Date.now(),
      }),
    );
  }
  await Promise.all(writes);
  return writes.length;
}

export function recallLocalHindsight(projectDir: string): string {
  return formatHindsightBlock(listHindsightRecords(projectDir));
}

export async function retainLocalFacts(
  projectDir: string,
  sessionId: string | number,
  items: Array<{ content: string; context?: string }>,
): Promise<number> {
  const writes: Promise<void>[] = [];
  for (const item of items) {
    writes.push(
      appendHindsightRecord(projectDir, {
        id: randomUUID(),
        sessionId: String(sessionId),
        content: item.content,
        tags: item.context ? ["tool", item.context] : ["tool"],
        source: "retain_tool",
        createdAt: Date.now(),
      }),
    );
  }
  await Promise.all(writes);
  return writes.length;
}

export function recallLocalByQuery(projectDir: string, query: string, limit = 10): HindsightRecord[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2);
  const records = listHindsightRecords(projectDir, 100);
  if (terms.length === 0) return records.slice(0, limit);

  const scored = records
    .map((record) => {
      const haystack = record.content.toLowerCase();
      const score = terms.reduce((sum, term) => (haystack.includes(term) ? sum + 1 : sum), 0);
      return { record, score };
    })
    .filter((item) => item.score > 0)
    .toSorted((a, b) => b.score - a.score || b.record.createdAt - a.record.createdAt);

  return scored.slice(0, limit).map((item) => item.record);
}
