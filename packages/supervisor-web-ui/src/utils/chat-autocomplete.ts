import { agentResourcesToUiItems } from "@/utils/resources-ui";
import { isTokenStart } from "./chat-token-patterns";
import { type FileIconKind, getFileIconKind } from "./file-type-icon";
import { fuzzyFilter } from "./fuzzy-filter";

export type AutocompleteTrigger = "at" | "atat" | "slash" | "skill";

export type AutocompleteItemKind = "file" | "project" | "nav-projects";

export interface WorkspaceFileEntry {
  path: string;
  isDirectory: boolean;
}

export interface ProjectAutocompleteEntry {
  id: string;
  name: string;
  cwd: string;
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

export interface CommandAutocompleteEntry {
  name: string;
  description: string;
  source?: "custom" | "mcp";
}

export interface ChatAutocompleteItem {
  value: string;
  label: string;
  description?: string;
  trigger: AutocompleteTrigger;
  kind?: AutocompleteItemKind;
  isDirectory?: boolean;
  fileIconKind?: FileIconKind;
  source?: "skill" | "prompt" | "custom" | "mcp";
  /** Absolute path for @@ inserts */
  absolutePath?: string;
  projectId?: string;
  projectCwd?: string;
}

export interface ChatAutocompleteContext {
  trigger: AutocompleteTrigger;
  /** Full token including @ / @@ / / */
  prefix: string;
  /** Replace range in plain text */
  replaceStart: number;
  replaceEnd: number;
}

export interface PathBrowseState {
  /** When set, @@ is listing files in this project; null = project picker */
  atatProject: ProjectAutocompleteEntry | null;
}

const PATH_DELIMITERS = new Set([" ", "\t", '"', "'", "="]);
const FILE_LIMIT = 12;
const PROJECT_LIMIT = 40;

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
    if (quoteStart > 0 && textBeforeCursor[quoteStart - 1] === "@") {
      const atIndex =
        quoteStart >= 2 && textBeforeCursor[quoteStart - 2] === "@"
          ? quoteStart - 2
          : quoteStart - 1;
      if (isTokenStart(textBeforeCursor, atIndex)) {
        return textBeforeCursor.slice(atIndex);
      }
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

/** Detect active @ / @@ / / / $ autocomplete at cursor. */
export function getAutocompleteContext(
  text: string,
  cursor: number,
): ChatAutocompleteContext | null {
  const textBeforeCursor = text.slice(0, cursor);

  const atPrefix = extractAtPrefix(textBeforeCursor);
  if (atPrefix) {
    const trigger: AutocompleteTrigger = atPrefix.startsWith("@@") ? "atat" : "at";
    return {
      trigger,
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

export function joinWorkspacePath(root: string, relativePath: string): string {
  const rel = relativePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (!rel || rel === ".") return root.replace(/[\\/]+$/, "") || root;
  const useBackslash = root.includes("\\");
  const sep = useBackslash ? "\\" : "/";
  const base = root.replace(/[\\/]+$/, "");
  const joined = rel.split("/").filter(Boolean).join(sep);
  return `${base}${sep}${joined}`;
}

function buildAtCompletionValue(path: string, quoted: boolean): string {
  const needsQuotes = quoted || /[\s"]/.test(path);
  return needsQuotes ? `@"${path}"` : `@${path}`;
}

function atQuery(prefix: string, trigger: "at" | "atat"): { quoted: boolean; query: string } {
  if (trigger === "atat") {
    if (prefix.startsWith('@@"')) return { quoted: true, query: prefix.slice(3) };
    return { quoted: false, query: prefix.slice(2) };
  }
  if (prefix.startsWith('@"')) return { quoted: true, query: prefix.slice(2) };
  return { quoted: false, query: prefix.slice(1) };
}

function normalizeCwdKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Exclude the session's own project from @@ picker (by id, cwd, or worktree under project). */
export function isCurrentProjectForAtat(
  project: ProjectAutocompleteEntry,
  currentWorkspaceCwd?: string,
  currentProjectId?: string | null,
): boolean {
  if (currentProjectId != null && String(currentProjectId) === String(project.id)) return true;

  const projectCwd = normalizeCwdKey(project.cwd);
  if (!projectCwd) return false;

  const current = normalizeCwdKey(currentWorkspaceCwd ?? "");
  if (!current) return false;

  return current === projectCwd || current.startsWith(`${projectCwd}/`);
}

/** Flat fuzzy file list (Codex / Cursor / Claude Code style). */
function buildFlatFileItems(
  trigger: "at" | "atat",
  files: WorkspaceFileEntry[],
  query: string,
  quoted: boolean,
  absoluteRoot?: string,
): ChatAutocompleteItem[] {
  const filtered = fuzzyFilter(files, query, (f) => f.path);
  return filtered.slice(0, FILE_LIMIT).map((f) => {
    const rel = f.isDirectory ? f.path.replace(/\/$/, "") : f.path;
    const abs = absoluteRoot ? joinWorkspacePath(absoluteRoot, rel) : undefined;
    const insertPath = absoluteRoot ? (abs ?? rel) : rel;
    return {
      trigger,
      kind: "file" as const,
      label: f.isDirectory ? `${rel}/` : rel,
      value: buildAtCompletionValue(insertPath, quoted),
      absolutePath: abs,
      isDirectory: f.isDirectory,
      fileIconKind: getFileIconKind(f.path, f.isDirectory),
      description: f.isDirectory
        ? absoluteRoot
          ? "其它项目目录"
          : "目录"
        : absoluteRoot
          ? "其它项目文件"
          : "文件",
    };
  });
}

export function getAutocompleteSuggestions(
  context: ChatAutocompleteContext,
  options: {
    workspaceFiles: WorkspaceFileEntry[];
    projects?: ProjectAutocompleteEntry[];
    atatFiles?: WorkspaceFileEntry[];
    browse?: PathBrowseState;
    currentWorkspaceCwd?: string;
    currentProjectId?: string | null;
    skills: SkillAutocompleteEntry[];
    prompts: PromptAutocompleteEntry[];
    commands?: CommandAutocompleteEntry[];
    skillTrigger?: "slash" | "dollar";
  },
): ChatAutocompleteItem[] {
  const browse: PathBrowseState = options.browse ?? { atatProject: null };

  if (context.trigger === "at") {
    const { quoted, query } = atQuery(context.prefix, "at");
    return buildFlatFileItems("at", options.workspaceFiles, query, quoted);
  }

  if (context.trigger === "atat") {
    const { quoted, query } = atQuery(context.prefix, "atat");
    if (!browse.atatProject) {
      const projects = (options.projects ?? []).filter(
        (p) => !isCurrentProjectForAtat(p, options.currentWorkspaceCwd, options.currentProjectId),
      );
      const filtered = fuzzyFilter(projects, query, (p) => `${p.name} ${p.cwd}`);
      return filtered.slice(0, PROJECT_LIMIT).map((p) => ({
        trigger: "atat" as const,
        kind: "project" as const,
        value: p.id,
        label: p.name,
        description: p.cwd,
        projectId: p.id,
        projectCwd: p.cwd,
      }));
    }

    return [
      {
        trigger: "atat" as const,
        kind: "nav-projects" as const,
        value: "__nav_projects__",
        label: "返回项目列表",
        description: browse.atatProject.name,
      },
      ...buildFlatFileItems(
        "atat",
        options.atatFiles ?? [],
        query,
        quoted,
        browse.atatProject.cwd,
      ),
    ];
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
    ...(options.commands ?? []).map((command) => ({
      trigger: "slash" as const,
      value: command.name.replace(/^\//, ""),
      label: `/${command.name.replace(/^\//, "")}`,
      source: command.source ?? (command.name.toLowerCase().startsWith("mcp") ? "mcp" : "custom"),
      description: command.description,
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

  if (context.trigger === "atat" && item.absolutePath) {
    const insertion = `${buildAtCompletionValue(item.absolutePath, false)} `;
    const next = before + insertion + after;
    return { text: next, cursor: before.length + insertion.length };
  }

  const insertion = `${item.value} `;
  const next = before + insertion + after;
  return { text: next, cursor: before.length + insertion.length };
}
