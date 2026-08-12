import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import type { AgentMessage, SessionTreeEntry } from "@earendil-works/pi-agent-core";
import { copyPathIntoSessionMedia, writeDataUrlIntoSessionMedia } from "../session-media.js";

export type ImportableExternalBackend = "codex" | "claude";

export interface ExternalSessionCandidate {
  backend: ImportableExternalBackend;
  externalSessionId: string;
  cwd: string;
  title: string;
  preview: string;
  lastActiveAt: string;
  /** Already imported into a supervisor session. */
  imported?: boolean;
  importedSessionId?: number;
}

export interface ExternalSessionPage {
  items: ExternalSessionCandidate[];
  hasMore: boolean;
  nextOffset: number;
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
  const cleaned = stripCodexImageTags(preview).text.trim();
  const firstLine = cleaned.split(/\r?\n/, 1)[0]?.trim();
  return firstLine ? firstLine.slice(0, 80) : fallback;
}

const CODEX_IMAGE_TAG_RE =
  /<image\b[^>]*\bname=(?:\[([^\]]+)\]|"([^"]+)"|'([^']+)')[^>]*\bpath="([^"]*)"[^>]*\/?\s*>\s*(?:<\/image\s*>)?/gi;

export type ImportedImagePart = {
  type: "image";
  name: string;
  /** Absolute source path from Codex/Claude (may be missing after Temp GC). */
  importPath?: string;
  /** Fallback data URL from jsonl when path is gone. */
  importDataUrl?: string;
  mediaId?: string;
  mimeType?: string;
};

function stripCodexImageTags(text: string): {
  text: string;
  images: Array<{ name: string; path: string }>;
} {
  const images: Array<{ name: string; path: string }> = [];
  let cleaned = text.replace(CODEX_IMAGE_TAG_RE, (_full, n1, n2, n3, path) => {
    const raw = String(n1 || n2 || n3 || "").trim() || `Image #${images.length + 1}`;
    const name = raw.startsWith("[") ? raw : `[${raw}]`;
    images.push({ name, path: String(path ?? "") });
    return "";
  });
  // Orphans left by older / partial tags.
  cleaned = cleaned
    .replace(/<\/image\s*>/gi, "")
    .replace(/(^|\n)\s*>\s*(?=\n|$)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: cleaned, images };
}

function ensureImagePlaceholders(text: string, imageNames: string[]): string {
  let next = text.trim();
  for (const name of imageNames) {
    if (!next.includes(name)) {
      next = next ? `${name}${next}` : name;
    }
  }
  return next;
}

function asUserMessageWithImages(
  text: string,
  images: ImportedImagePart[],
  timestamp?: string,
): SessionTreeEntry {
  const { iso, ms } = entryTimestamp(timestamp);
  const content: Array<Record<string, unknown>> = [];
  if (text.trim()) content.push({ type: "text", text: text.trim() });
  for (const image of images) {
    content.push({ ...image });
  }
  return {
    id: randomUUID(),
    parentId: null,
    timestamp: iso,
    type: "message",
    message: {
      role: "user",
      content,
      timestamp: ms,
    },
  } as unknown as SessionTreeEntry;
}

function parseCodexUserPayload(content: unknown): {
  text: string;
  images: ImportedImagePart[];
} {
  const images: ImportedImagePart[] = [];
  const texts: string[] = [];
  const dataUrls: string[] = [];

  if (typeof content === "string") {
    const stripped = stripCodexImageTags(content);
    for (const image of stripped.images) {
      images.push({
        type: "image",
        name: image.name,
        importPath: image.path || undefined,
      });
    }
    if (stripped.text) texts.push(stripped.text);
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const type = (part as { type?: string }).type;
      if (type === "input_text" && typeof (part as { text?: string }).text === "string") {
        const stripped = stripCodexImageTags((part as { text: string }).text);
        for (const image of stripped.images) {
          images.push({
            type: "image",
            name: image.name,
            importPath: image.path || undefined,
          });
        }
        if (stripped.text) texts.push(stripped.text);
      } else if (
        type === "input_image" &&
        typeof (part as { image_url?: string }).image_url === "string"
      ) {
        dataUrls.push((part as { image_url: string }).image_url);
      }
    }
  }

  // Attach data URLs to images missing paths, in order.
  let dataIndex = 0;
  for (const image of images) {
    if (!image.importPath && dataUrls[dataIndex]) {
      image.importDataUrl = dataUrls[dataIndex++];
    }
  }
  while (dataIndex < dataUrls.length) {
    images.push({
      type: "image",
      name: `[Image #${images.length + 1}]`,
      importDataUrl: dataUrls[dataIndex++],
    });
  }

  const text = ensureImagePlaceholders(
    texts.join("\n").trim(),
    images.map((image) => image.name),
  );
  return { text, images };
}

export async function materializeImportedImages(
  sessionId: number,
  entries: SessionTreeEntry[],
): Promise<SessionTreeEntry[]> {
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message?.role !== "user") continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) continue;
    const parts = content as unknown as Array<Record<string, unknown>>;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (part.type !== "image") continue;
      if (typeof part.mediaId === "string" && part.mediaId) continue;
      let saved = null;
      if (typeof part.importPath === "string" && part.importPath) {
        saved = await copyPathIntoSessionMedia(sessionId, part.importPath, {
          name: typeof part.name === "string" ? part.name : undefined,
        });
      }
      if (!saved && typeof part.importDataUrl === "string" && part.importDataUrl) {
        saved = await writeDataUrlIntoSessionMedia(sessionId, part.importDataUrl, {
          name: typeof part.name === "string" ? part.name : undefined,
        });
      }
      if (!saved) {
        parts[i] = {
          type: "image",
          name: (typeof part.name === "string" && part.name) || "[Image]",
          missing: true,
        };
        continue;
      }
      parts[i] = {
        type: "image",
        name: (typeof part.name === "string" && part.name) || saved.name || "[Image]",
        mediaId: saved.mediaId,
        mimeType: saved.mimeType,
      };
    }
  }
  return entries;
}

function entryTimestamp(timestamp?: string): { iso: string; ms: number } {
  const ms = timestamp ? Date.parse(timestamp) : Date.now();
  const safe = Number.isFinite(ms) ? ms : Date.now();
  return { iso: timestamp ?? new Date(safe).toISOString(), ms: safe };
}

function asTextMessage(
  role: "user" | "assistant",
  content: string,
  timestamp?: string,
): SessionTreeEntry {
  const { iso, ms } = entryTimestamp(timestamp);
  return {
    id: randomUUID(),
    parentId: null,
    timestamp: iso,
    type: "message",
    message: {
      role,
      content: [{ type: "text", text: content }],
      timestamp: ms,
    } as AgentMessage,
  } as SessionTreeEntry;
}

type AssistantContentPart =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> };

function asAssistantPartsMessage(
  parts: AssistantContentPart[],
  timestamp?: string,
): SessionTreeEntry | null {
  if (parts.length === 0) return null;
  const { iso, ms } = entryTimestamp(timestamp);
  return {
    id: randomUUID(),
    parentId: null,
    timestamp: iso,
    type: "message",
    message: {
      role: "assistant",
      content: parts,
      timestamp: ms,
    } as AgentMessage,
  } as SessionTreeEntry;
}

function asToolResultEntry(
  toolCallId: string,
  toolName: string,
  output: string,
  timestamp?: string,
  isError = false,
): SessionTreeEntry {
  const { iso, ms } = entryTimestamp(timestamp);
  return {
    id: randomUUID(),
    parentId: null,
    timestamp: iso,
    type: "message",
    message: {
      role: "toolResult",
      toolCallId,
      toolName,
      content: [{ type: "text", text: output }],
      isError,
      timestamp: ms,
    },
  } as SessionTreeEntry;
}

function unescapeQuoted(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

function extractJsStringProp(source: string, key: string): string | undefined {
  const match = source.match(new RegExp(`${key}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
  return match ? unescapeQuoted(match[1]!) : undefined;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { input: value };
    }
  }
  return {};
}

function normalizeToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "tool";
  const lower = trimmed.toLowerCase();
  const aliases: Record<string, string> = {
    bash: "bash",
    shell: "bash",
    shell_command: "bash",
    read: "read",
    write: "write",
    edit: "edit",
    glob: "glob",
    grep: "grep",
  };
  return aliases[lower] ?? trimmed;
}

function extractPatchPaths(input: string): string[] {
  const paths: string[] = [];
  const re = /\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+)/g;
  for (const match of input.matchAll(re)) {
    const raw = match[1]?.trim();
    if (raw) paths.push(raw.replace(/\\/g, "/"));
  }
  return [...new Set(paths)];
}

function classifyCodexExec(
  input: string,
  command: string | undefined,
): {
  name: string;
  arguments: Record<string, unknown>;
} {
  if (
    input.includes("*** Begin Patch") ||
    input.includes("*** Update File:") ||
    /apply[_ ]?patch/i.test(input)
  ) {
    const paths = extractPatchPaths(input);
    return {
      name: "edit",
      arguments: {
        path: paths[0] ?? "",
        paths,
        input,
      },
    };
  }
  if (command) {
    const readMatch = command.match(
      /^(?:Get-Content|type|cat|bat)\s+(?:-Path\s+)?["']?([^\s"']+)/i,
    );
    if (readMatch?.[1]) {
      return { name: "read", arguments: { path: readMatch[1].replace(/\\/g, "/") } };
    }
    return { name: "bash", arguments: { command } };
  }
  return { name: "exec", arguments: { input } };
}

function codexToolCall(
  payload: Record<string, any>,
): { id: string; name: string; arguments: Record<string, unknown> } | null {
  const id =
    (typeof payload.call_id === "string" && payload.call_id) ||
    (typeof payload.id === "string" && payload.id) ||
    "";
  if (!id) return null;
  const rawName = typeof payload.name === "string" ? payload.name : "tool";
  if (payload.type === "custom_tool_call" && typeof payload.input === "string") {
    const command = extractJsStringProp(payload.input, "command");
    return { id, ...classifyCodexExec(payload.input, command) };
  }
  return {
    id,
    name: normalizeToolName(rawName),
    arguments: parseJsonObject(payload.arguments),
  };
}

function codexToolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  return textContent(output, ["input_text", "output_text", "text"]);
}

function looksLikeToolError(output: string): boolean {
  return /script\s+failed|script\s+error|exit code:\s*[1-9]/i.test(output);
}

function claudeToolName(name: unknown): string {
  return normalizeToolName(typeof name === "string" ? name : "tool");
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
        const parsed = parseCodexUserPayload(value.payload.content);
        const text = parsed.text.replace(/\[Image #[^\]]+\]/g, "").trim() || parsed.text;
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

export async function listExternalSessions(
  limit = 40,
  offset = 0,
): Promise<ExternalSessionPage> {
  const pageSize = Math.min(Math.max(limit, 1), 100);
  const start = Math.max(offset, 0);
  const files = await discoverFiles(start + pageSize + 1);
  const page = files.slice(start, start + pageSize);
  return {
    items: page.map(({ file: _file, ...candidate }) => candidate),
    hasMore: files.length > start + pageSize,
    nextOffset: start + page.length,
  };
}

export async function loadExternalSession(
  backend: ImportableExternalBackend,
  externalSessionId: string,
): Promise<{ candidate: ExternalSessionCandidate; entries: SessionTreeEntry[] }> {
  // The picker can expose conversations far older than the first page. Search
  // every source file here so selecting an old conversation remains importable.
  const files = await discoverFiles(Number.MAX_SAFE_INTEGER);
  const match = files.find(
    (item) => item.backend === backend && item.externalSessionId === externalSessionId,
  );
  if (!match) throw new Error("External session was not found");

  const entries: SessionTreeEntry[] = [];
  let parentId: string | null = null;
  let lastAssistantText = "";
  const toolNames = new Map<string, string>();

  const push = (entry: SessionTreeEntry | null | undefined) => {
    if (!entry) return;
    entry.parentId = parentId;
    entries.push(entry);
    parentId = entry.id;
  };

  await readJsonLines(match.file, (value) => {
    if (backend === "codex" && value.type === "response_item") {
      const payload = value.payload as Record<string, any> | undefined;
      const kind = payload?.type;
      const timestamp = typeof value.timestamp === "string" ? value.timestamp : undefined;

      if (kind === "function_call" || kind === "custom_tool_call") {
        const call = payload ? codexToolCall(payload) : null;
        if (!call) return;
        lastAssistantText = "";
        toolNames.set(call.id, call.name);
        push(
          asAssistantPartsMessage(
            [{ type: "toolCall", id: call.id, name: call.name, arguments: call.arguments }],
            timestamp,
          ),
        );
        return;
      }

      if (kind === "function_call_output" || kind === "custom_tool_call_output") {
        const callId = typeof payload?.call_id === "string" ? payload.call_id : "";
        if (!callId) return;
        lastAssistantText = "";
        const output = codexToolOutput(payload?.output);
        const toolName = toolNames.get(callId) ?? "tool";
        push(asToolResultEntry(callId, toolName, output, timestamp, looksLikeToolError(output)));
        return;
      }

      if (kind === "message") {
        const role =
          payload?.role === "user" || payload?.role === "assistant" ? payload.role : null;
        if (!role) return;
        if (role === "user") {
          const parsed = parseCodexUserPayload(payload?.content);
          const textForInjectCheck = parsed.text.replace(/\[Image #[^\]]+\]/g, "").trim();
          if (
            parsed.images.length === 0 &&
            (!parsed.text || isInjectedExternalUserText(parsed.text))
          ) {
            return;
          }
          if (
            parsed.images.length === 0 &&
            textForInjectCheck &&
            isInjectedExternalUserText(textForInjectCheck)
          ) {
            return;
          }
          if (
            parsed.images.length > 0 &&
            textForInjectCheck &&
            isInjectedExternalUserText(textForInjectCheck)
          ) {
            // Keep images, drop injected instruction text.
            parsed.text = ensureImagePlaceholders(
              "",
              parsed.images.map((image) => image.name),
            );
          }
          lastAssistantText = "";
          if (parsed.images.length > 0) {
            push(asUserMessageWithImages(parsed.text, parsed.images, timestamp));
          } else if (parsed.text) {
            push(asTextMessage("user", parsed.text, timestamp));
          }
          return;
        }
        const content = textContent(payload?.content, ["output_text"]);
        if (!content) return;
        const prev = entries[entries.length - 1];
        const prevTextPart =
          prev?.type === "message" &&
          prev.message?.role === "assistant" &&
          Array.isArray(prev.message.content) &&
          prev.message.content.length === 1 &&
          prev.message.content[0]?.type === "text"
            ? (prev.message.content[0] as { type: "text"; text: string })
            : null;
        if (prevTextPart && prev?.type === "message") {
          const prevText = prevTextPart.text;
          if (prevText.startsWith(content)) {
            // Shorter / duplicate prefix of the previous assistant text.
            return;
          }
          if (content.startsWith(prevText)) {
            // Streaming-style extension of the previous assistant text.
            prevTextPart.text = content;
            lastAssistantText = content;
            if (timestamp) {
              prev.timestamp = timestamp;
              (prev.message as { timestamp?: number }).timestamp = entryTimestamp(timestamp).ms;
            }
            return;
          }
          // Distinct consecutive assistant texts → one bubble (no UI text-text divider).
          prevTextPart.text = `${prevText.replace(/\s*$/, "")}\n\n${content.replace(/^\s*/, "")}`;
          lastAssistantText = prevTextPart.text;
          if (timestamp) {
            prev.timestamp = timestamp;
            (prev.message as { timestamp?: number }).timestamp = entryTimestamp(timestamp).ms;
          }
          return;
        }
        lastAssistantText = content;
        push(asTextMessage("assistant", content, timestamp));
      }
      return;
    }

    if (backend === "claude" && (value.type === "user" || value.type === "assistant")) {
      const timestamp = typeof value.timestamp === "string" ? value.timestamp : undefined;
      const rawContent = value.message?.content;
      if (value.type === "user") {
        lastAssistantText = "";
        if (Array.isArray(rawContent)) {
          for (const part of rawContent) {
            if (!part || typeof part !== "object") continue;
            if ((part as { type?: string }).type !== "tool_result") continue;
            const callId =
              typeof (part as { tool_use_id?: string }).tool_use_id === "string"
                ? (part as { tool_use_id: string }).tool_use_id
                : "";
            if (!callId) continue;
            const output =
              typeof (part as { content?: unknown }).content === "string"
                ? (part as { content: string }).content
                : textContent((part as { content?: unknown }).content, ["text"]);
            const isError =
              !!(part as { is_error?: boolean }).is_error || looksLikeToolError(output);
            const toolName = toolNames.get(callId) ?? "tool";
            push(asToolResultEntry(callId, toolName, output, timestamp, isError));
          }
        }
        const text = textContent(rawContent, ["text"]);
        if (text && !isInjectedExternalUserText(text)) {
          push(asTextMessage("user", text, timestamp));
        }
        return;
      }

      // assistant
      const parts: AssistantContentPart[] = [];
      if (typeof rawContent === "string" && rawContent.trim()) {
        parts.push({ type: "text", text: rawContent.trim() });
      } else if (Array.isArray(rawContent)) {
        for (const part of rawContent) {
          if (!part || typeof part !== "object") continue;
          const type = (part as { type?: string }).type;
          if (type === "text" && typeof (part as { text?: string }).text === "string") {
            const text = (part as { text: string }).text.trim();
            if (text) parts.push({ type: "text", text });
          } else if (
            type === "thinking" &&
            typeof (part as { thinking?: string }).thinking === "string"
          ) {
            const thinking = (part as { thinking: string }).thinking.trim();
            if (thinking) parts.push({ type: "thinking", thinking });
          } else if (type === "tool_use") {
            const id =
              typeof (part as { id?: string }).id === "string" ? (part as { id: string }).id : "";
            if (!id) continue;
            const name = claudeToolName((part as { name?: string }).name);
            const args = parseJsonObject((part as { input?: unknown }).input);
            toolNames.set(id, name);
            parts.push({ type: "toolCall", id, name, arguments: args });
          }
        }
      }
      if (parts.length === 0) return;
      lastAssistantText = "";
      push(asAssistantPartsMessage(parts, timestamp));
    }
  });

  const { file: _file, ...candidate } = match;
  return { candidate, entries };
}
