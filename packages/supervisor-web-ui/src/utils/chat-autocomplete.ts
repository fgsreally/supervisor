import { agentResourcesToUiItems } from "@/utils/resources-ui";
import { isTokenStart } from "./chat-token-patterns";
import { type FileIconKind, getFileIconKind } from "./file-type-icon";
import { fuzzyFilter } from "./fuzzy-filter";

export type AutocompleteTrigger = "at" | "slash" | "skill";

export interface WorkspaceFileEntry {
  path: string;
  isDirectory: boolean;
}

export interface SkillAutocompleteEntry {
  name: string;
  description: string;
  source?: "skill";
}

export interface PromptAutocompleteEntry {
  name: string;
  description: string;
  source?: "prompt";
}

export interface ChatAutocompleteItem {
  value: string;
  label: string;
  description?: string;
  trigger: AutocompleteTrigger;
  isDirectory?: boolean;
  fileIconKind?: FileIconKind;
  source?: "skill" | "prompt";
}

export interface ChatAutocompleteContext {
  trigger: AutocompleteTrigger;
  /** Full token including @ or / */
  prefix: string;
  /** Replace range in plain text */
  replaceStart: number;
  replaceEnd: number;
}

const PATH_DELIMITERS = new Set([" ", "\t", '"', "'", "="]);

function findUnclosedQuoteStart(text: string): number | null {
  let inQuotes = false;
  let quoteStart = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      inQuotes = !inQuotes;
      if (inQuotes) quoteStart = i;
    }
  }
  return inQuotes ? quoteStart : null;
}

function extractAtPrefix(textBeforeCursor: string): string | null {
  const quoteStart = findUnclosedQuoteStart(textBeforeCursor);
  if (quoteStart !== null) {
    if (
      quoteStart > 0 &&
      textBeforeCursor[quoteStart - 1] === "@" &&
      isTokenStart(textBeforeCursor, quoteStart - 1)
    ) {
      return textBeforeCursor.slice(quoteStart - 1);
    }
    if (isTokenStart(textBeforeCursor, quoteStart)) {
      return textBeforeCursor.slice(quoteStart);
    }
    return null;
  }

  for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
    const ch = textBeforeCursor[i] ?? "";
    if (ch === "@" && isTokenStart(textBeforeCursor, i)) {
      return textBeforeCursor.slice(i);
    }
    if (PATH_DELIMITERS.has(ch)) break;
  }
  return null;
}

function extractSlashPrefix(textBeforeCursor: string): string | null {
  for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
    const ch = textBeforeCursor[i] ?? "";
    if (ch === "/" && isTokenStart(textBeforeCursor, i)) {
      const token = textBeforeCursor.slice(i);
      if (token.includes(" ")) return null;
      return token;
    }
    if (PATH_DELIMITERS.has(ch)) break;
  }
  return null;
}

function extractSkillPrefix(textBeforeCursor: string): string | null {
  for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
    const ch = textBeforeCursor[i] ?? "";
    if (ch === "$" && isTokenStart(textBeforeCursor, i)) {
      const token = textBeforeCursor.slice(i);
      return token.includes(" ") ? null : token;
    }
    if (PATH_DELIMITERS.has(ch)) break;
  }
  return null;
}

/** Detect active @ or / autocomplete at cursor. */
export function getAutocompleteContext(
  text: string,
  cursor: number,
): ChatAutocompleteContext | null {
  const textBeforeCursor = text.slice(0, cursor);

  const atPrefix = extractAtPrefix(textBeforeCursor);
  if (atPrefix) {
    return {
      trigger: "at",
      prefix: atPrefix,
      replaceStart: cursor - atPrefix.length,
      replaceEnd: cursor,
    };
  }

  const slashPrefix = extractSlashPrefix(textBeforeCursor);
  if (slashPrefix) {
    return {
      trigger: "slash",
      prefix: slashPrefix,
      replaceStart: cursor - slashPrefix.length,
      replaceEnd: cursor,
    };
  }

  const skillPrefix = extractSkillPrefix(textBeforeCursor);
  if (skillPrefix) {
    return {
      trigger: "skill",
      prefix: skillPrefix,
      replaceStart: cursor - skillPrefix.length,
      replaceEnd: cursor,
    };
  }

  return null;
}

function buildFileCompletionValue(path: string, isDirectory: boolean, quoted: boolean): string {
  const needsQuotes = quoted || path.includes(" ");
  if (!needsQuotes) {
    return `@${path}${isDirectory ? "" : ""}`;
  }
  return `@"${path}"`;
}

export function getAutocompleteSuggestions(
  context: ChatAutocompleteContext,
  options: {
    workspaceFiles: WorkspaceFileEntry[];
    skills: SkillAutocompleteEntry[];
    prompts: PromptAutocompleteEntry[];
    skillTrigger?: "slash" | "dollar";
  },
): ChatAutocompleteItem[] {
  if (context.trigger === "at") {
    const quoted = context.prefix.startsWith('@"');
    const rawQuery = quoted ? context.prefix.slice(2) : context.prefix.slice(1);
    const filtered = fuzzyFilter(options.workspaceFiles, rawQuery, (f) => f.path);
    return filtered.slice(0, 12).map((f) => ({
      trigger: "at" as const,
      label: f.isDirectory ? `${f.path}/` : f.path,
      value: buildFileCompletionValue(f.path, f.isDirectory, quoted),
      isDirectory: f.isDirectory,
      fileIconKind: getFileIconKind(f.path, f.isDirectory),
      description: f.isDirectory ? "目录" : "文件",
    }));
  }

  const query = context.prefix.slice(1);
  if (context.trigger === "skill") {
    if (options.skillTrigger !== "dollar") return [];
    return fuzzyFilter(options.skills, query, (skill) => skill.name)
      .slice(0, 12)
      .map((skill) => ({
        trigger: "skill" as const,
        value: skill.name,
        label: `$${skill.name}`,
        description: skill.description,
      }));
  }
  const slashItems: ChatAutocompleteItem[] = [
    ...(options.skillTrigger === "dollar" ? [] : options.skills).map((skill) => {
      const commandName = skill.name;
      return {
        trigger: "slash" as const,
        value: commandName,
        label: `/${commandName}`,
        description: skill.description,
        source: "skill" as const,
      };
    }),
    ...options.prompts.map((prompt) => ({
      trigger: "slash" as const,
      value: prompt.name,
      label: `/${prompt.name}`,
      source: "prompt" as const,
      description: prompt.description || "Prompt 模板",
    })),
  ];

  const filtered = fuzzyFilter(slashItems, query, (item) => item.value);
  return filtered.slice(0, 12);
}

export function promptsFromAgentResources(
  agentId: string,
  resources: import("@/api").AgentResources | undefined,
): PromptAutocompleteEntry[] {
  if (!resources) return [];
  return agentResourcesToUiItems(agentId, resources)
    .filter((r) => r.kind === "prompts")
    .map((p) => ({ name: p.name, description: p.description }));
}

export function skillsFromAgentResources(
  agentId: string,
  resources: import("@/api").AgentResources | undefined,
): SkillAutocompleteEntry[] {
  if (!resources) return [];
  return agentResourcesToUiItems(agentId, resources)
    .filter((r) => r.kind === "skills")
    .map((s) => ({ name: s.name, description: s.description }));
}

export function applyAutocompleteCompletion(
  text: string,
  context: ChatAutocompleteContext,
  item: ChatAutocompleteItem,
): { text: string; cursor: number } {
  const before = text.slice(0, context.replaceStart);
  const after = text.slice(context.replaceEnd);

  if (context.trigger === "slash" || context.trigger === "skill") {
    const insertion = `${context.trigger === "slash" ? "/" : "$"}${item.value} `;
    const next = before + insertion + after;
    return { text: next, cursor: before.length + insertion.length };
  }

  const isDirectory = item.isDirectory ?? false;
  const suffix = isDirectory ? "" : " ";
  const insertion = item.value + suffix;
  const next = before + insertion + after;
  let cursor = before.length + item.value.length;
  if (!isDirectory) cursor += suffix.length;
  return { text: next, cursor };
}
