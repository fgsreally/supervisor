import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import type { AgentMessage, SessionTreeEntry } from "@earendil-works/pi-agent-core";

export type ImportableExternalBackend = "codex" | "claude";

export interface ExternalSessionCandidate {
  backend: ImportableExternalBackend;
  externalSessionId: string;
  cwd: string;
  title: string;
  preview: string;
  lastActiveAt: string;
}

interface ExternalSessionFile extends ExternalSessionCandidate {
  file: string;
}

function jsonlFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => join(entry.parentPath, entry.name));
}

async function readJsonLines(
  file: string,
  visitor: (value: Record<string, any>) => boolean | void,
): Promise<void> {
  const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }) });
  for await (const line of lines) {
    try {
      if (visitor(JSON.parse(line) as Record<string, any>) === false) break;
    } catch {
      // Ignore incomplete lines left by an active external process.
    }
  }
}

function textContent(content: unknown, kinds: string[]): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: string; text: string } =>
        !!part &&
        typeof part === "object" &&
        kinds.includes((part as { type?: string }).type ?? "") &&
        typeof (part as { text?: string }).text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

/** Skip Codex/Claude injected context that is not a real user turn. */
export function isInjectedExternalUserText(text: string): boolean {
  const value = text.trim();
  if (!value) return true;
  if (/^#\s*AGENTS\.md\b/i.test(value)) return true;
  if (value.includes("<INSTRUCTIONS>") && /AGENTS\.md/i.test(value)) return true;
  if (value.startsWith("<environment_context>")) return true;
  if (value.startsWith("<permissions instructions>")) return true;
  if (value.startsWith("<collaboration_mode>")) return true;
  if (value.startsWith("<skills_instructions>")) return true;
  if (value.startsWith("<apps_instructions>")) return true;
  if (value.startsWith("<plugins_instructions>")) return true;
  if (value.startsWith("<multi_agent_mode>")) return true;
  if (/^You are `\/root`/i.test(value)) return true;
  if (value.startsWith("Caveat:") && value.toLowerCase().includes("automatically")) return true;
  return false;
}

function displayTitle(preview: string, fallback: string): string {
  const firstLine = preview.split(/\r?\n/, 1)[0]?.trim();
  return firstLine ? firstLine.slice(0, 80) : fallback;
}

function asTextMessage(role: "user" | "assistant", content: string, timestamp?: string): SessionTreeEntry {
  const id = randomUUID();
  const ts = timestamp ? Date.parse(timestamp) : Date.now();
  return {
    id,
    parentId: null,
    timestamp: timestamp ?? new Date().toISOString(),
    type: "message",
    message: {
      role,
      content: [{ type: "text", text: content }],
      timestamp: Number.isFinite(ts) ? ts : Date.now(),
    } as AgentMessage,
  } as SessionTreeEntry;
}

async function inspectCodex(file: string): Promise<ExternalSessionFile | null> {
  let externalSessionId = "";
  let cwd = "";
  let preview = "";
  await readJsonLines(file, (value) => {
    if (value.type === "session_meta") {
      externalSessionId = value.payload?.session_id ?? value.payload?.id ?? "";
      cwd = value.payload?.cwd ?? "";
    } else if (value.type === "response_item" && value.payload?.type === "message") {
      if (value.payload.role === "user") {
        const text = textContent(value.payload.content, ["input_text"]);
        if (text && !isInjectedExternalUserText(text)) preview ||= text;
      }
    }
    if (externalSessionId && cwd && preview) return false;
  });
  if (!externalSessionId || !cwd || !existsSync(cwd)) return null;
  return {
    backend: "codex",
    externalSessionId,
    cwd,
    preview,
    title: displayTitle(preview, `Codex ${externalSessionId.slice(0, 8)}`),
    lastActiveAt: statSync(file).mtime.toISOString(),
    file,
  };
}

async function inspectClaude(file: string): Promise<ExternalSessionFile | null> {
  let externalSessionId = basename(file, ".jsonl");
  let cwd = "";
  let preview = "";
  await readJsonLines(file, (value) => {
    if (typeof value.sessionId === "string") externalSessionId = value.sessionId;
    if (typeof value.cwd === "string") cwd = value.cwd;
    if (value.type === "user" && value.message?.role === "user") {
      const text = textContent(value.message.content, ["text"]);
      if (text && !isInjectedExternalUserText(text)) preview ||= text;
    }
    if (cwd && preview) return false;
  });
  if (!externalSessionId || !cwd || !existsSync(cwd)) return null;
  return {
    backend: "claude",
    externalSessionId,
    cwd,
    preview,
    title: displayTitle(preview, `Claude Code ${externalSessionId.slice(0, 8)}`),
    lastActiveAt: statSync(file).mtime.toISOString(),
    file,
  };
}

async function discoverFiles(limit: number): Promise<ExternalSessionFile[]> {
  const roots: Array<{
    backend: ImportableExternalBackend;
    root: string;
    inspect: (file: string) => Promise<ExternalSessionFile | null>;
  }> = [
    { backend: "codex", root: join(homedir(), ".codex", "sessions"), inspect: inspectCodex },
    { backend: "claude", root: join(homedir(), ".claude", "projects"), inspect: inspectClaude },
  ];
  const recent = roots.flatMap(({ backend, root, inspect }) =>
    jsonlFiles(root)
      .filter(
        (file) => backend !== "claude" || !/[\\/]subagents[\\/]|[\\/]workflows[\\/]/.test(file),
      )
      .map((file) => ({ file, inspect, mtime: statSync(file).mtimeMs })),
  );
  recent.sort((left, right) => right.mtime - left.mtime);
  const inspected = await Promise.all(
    recent.slice(0, Math.max(limit * 3, 60)).map((item) => item.inspect(item.file)),
  );
  return inspected.filter((item): item is ExternalSessionFile => item !== null).slice(0, limit);
}

export async function listExternalSessions(limit = 40): Promise<ExternalSessionCandidate[]> {
  const files = await discoverFiles(Math.min(Math.max(limit, 1), 100));
  return files.map(({ file: _file, ...candidate }) => candidate);
}

export async function loadExternalSession(
  backend: ImportableExternalBackend,
  externalSessionId: string,
): Promise<{ candidate: ExternalSessionCandidate; entries: SessionTreeEntry[] }> {
  const files = await discoverFiles(100);
  const match = files.find(
    (item) => item.backend === backend && item.externalSessionId === externalSessionId,
  );
  if (!match) throw new Error("External session was not found");

  const entries: SessionTreeEntry[] = [];
  let parentId: string | null = null;
  let lastAssistantText = "";
  await readJsonLines(match.file, (value) => {
    let role: "user" | "assistant" | null = null;
    let content = "";
    let timestamp: string | undefined;
    if (
      backend === "codex" &&
      value.type === "response_item" &&
      value.payload?.type === "message"
    ) {
      role =
        value.payload.role === "user" || value.payload.role === "assistant"
          ? value.payload.role
          : null;
      content = textContent(
        value.payload.content,
        role === "user" ? ["input_text"] : ["output_text"],
      );
      timestamp = value.timestamp;
    } else if (backend === "claude" && (value.type === "user" || value.type === "assistant")) {
      role =
        value.message?.role === "user" || value.message?.role === "assistant"
          ? value.message.role
          : null;
      content = textContent(value.message?.content, ["text"]);
      timestamp = value.timestamp;
    }
    if (!role || !content) return;
    if (role === "user" && isInjectedExternalUserText(content)) return;
    // Codex may emit progressive assistant snapshots; keep the longest for a run of assistants.
    if (role === "assistant") {
      if (lastAssistantText && content.startsWith(lastAssistantText)) {
        const prev = entries[entries.length - 1];
        if (prev?.type === "message" && prev.message?.role === "assistant") {
          entries.pop();
          parentId = prev.parentId ?? null;
        }
      } else if (lastAssistantText && lastAssistantText.startsWith(content)) {
        return;
      }
      lastAssistantText = content;
    } else {
      lastAssistantText = "";
    }
    const entry = asTextMessage(role, content, timestamp);
    entry.parentId = parentId;
    entries.push(entry);
    parentId = entry.id;
  });
  const { file: _file, ...candidate } = match;
  return { candidate, entries };
}
