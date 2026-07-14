import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, dirname, isAbsolute, resolve } from "path";
import { parseFrontmatter } from "../utils/frontmatter.js";
import { createSyntheticSourceInfo, type SourceInfo } from "../utils/source-info.js";

/**
 * Represents a prompt template loaded from a markdown file
 */
export interface PromptTemplate {
  name: string;
  description: string;
  argumentHint?: string;
  content: string;
  sourceInfo: SourceInfo;
  filePath: string; // Absolute path to the template file
}

/**
 * Parse command arguments respecting quoted strings (bash-style)
 * Returns array of arguments
 */
export function parseCommandArgs(argsString: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === " " || char === "\t") {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  return args;
}

/**
 * Substitute argument placeholders in template content
 * Supports:
 * - $1, $2, ... for positional args
 * - $@ and $ARGUMENTS for all args
 * - ${@:N} for args from Nth onwards (bash-style slicing)
 * - ${@:N:L} for L args starting from Nth
 */
export function substituteArgs(content: string, args: string[]): string {
  let result = content;

  result = result.replace(/\$(\d+)/g, (_, num) => {
    const index = parseInt(num, 10) - 1;
    return args[index] ?? "";
  });

  result = result.replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_, startStr, lengthStr) => {
    let start = parseInt(startStr, 10) - 1;
    if (start < 0) start = 0;

    if (lengthStr) {
      const length = parseInt(lengthStr, 10);
      return args.slice(start, start + length).join(" ");
    }
    return args.slice(start).join(" ");
  });

  const allArgs = args.join(" ");
  result = result.replace(/\$ARGUMENTS/g, allArgs);
  result = result.replace(/\$@/g, allArgs);

  return result;
}

function loadTemplateFromFile(filePath: string, sourceInfo: SourceInfo): PromptTemplate | null {
  try {
    const rawContent = readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(rawContent);

    const name = basename(filePath).replace(/\.md$/, "");

    let description = frontmatter.description || "";
    if (!description) {
      const firstLine = body.split("\n").find((line) => line.trim());
      if (firstLine) {
        description = firstLine.slice(0, 60);
        if (firstLine.length > 60) description += "...";
      }
    }

    return {
      name,
      description,
      ...(frontmatter["argument-hint"] && { argumentHint: frontmatter["argument-hint"] }),
      content: body,
      sourceInfo,
      filePath,
    };
  } catch {
    return null;
  }
}

/**
 * Scan a directory for .md files (non-recursive) and load them as prompt templates.
 */
function loadTemplatesFromDir(
  dir: string,
  getSourceInfo: (filePath: string) => SourceInfo,
): PromptTemplate[] {
  const templates: PromptTemplate[] = [];

  if (!existsSync(dir)) {
    return templates;
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          const stats = statSync(fullPath);
          isFile = stats.isFile();
        } catch {
          continue;
        }
      }

      if (isFile && entry.name.endsWith(".md")) {
        const template = loadTemplateFromFile(fullPath, getSourceInfo(fullPath));
        if (template) {
          templates.push(template);
        }
      }
    }
  } catch {
    return templates;
  }

  return templates;
}

export interface LoadPromptTemplatesOptions {
  /** Base directory used to resolve relative resource paths. */
  cwd: string;
  /** Prompt paths obtained from resource catalog bindings. */
  promptPaths: string[];
}

function normalizePath(input: string): string {
  const trimmed = input.trim();
  return trimmed;
}

function resolvePromptPath(p: string, cwd: string): string {
  const normalized = normalizePath(p);
  return isAbsolute(normalized) ? normalized : resolve(cwd, normalized);
}

/**
 * Load prompt templates from explicit resource catalog paths.
 */
export function loadPromptTemplates(options: LoadPromptTemplatesOptions): PromptTemplate[] {
  const resolvedCwd = options.cwd;
  const promptPaths = options.promptPaths;

  const templates: PromptTemplate[] = [];

  const getSourceInfo = (resolvedPath: string): SourceInfo => {
    return createSyntheticSourceInfo(resolvedPath, {
      source: "local",
      baseDir: statSync(resolvedPath).isDirectory() ? resolvedPath : dirname(resolvedPath),
    });
  };

  for (const rawPath of promptPaths) {
    const resolvedPath = resolvePromptPath(rawPath, resolvedCwd);
    if (!existsSync(resolvedPath)) {
      continue;
    }

    try {
      const stats = statSync(resolvedPath);
      if (stats.isDirectory()) {
        templates.push(...loadTemplatesFromDir(resolvedPath, getSourceInfo));
      } else if (stats.isFile() && resolvedPath.endsWith(".md")) {
        const template = loadTemplateFromFile(resolvedPath, getSourceInfo(resolvedPath));
        if (template) {
          templates.push(template);
        }
      }
    } catch {
      // Ignore read failures
    }
  }

  return templates;
}

/**
 * Expand a prompt template if it matches a template name.
 * Returns the expanded content or the original text if not a template.
 */
export function expandPromptTemplate(text: string, templates: PromptTemplate[]): string {
  if (!text.startsWith("/")) return text;

  const spaceIndex = text.indexOf(" ");
  const templateName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
  const argsString = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);

  const template = templates.find((t) => t.name === templateName);
  if (template) {
    const args = parseCommandArgs(argsString);
    return substituteArgs(template.content, args);
  }

  return text;
}
