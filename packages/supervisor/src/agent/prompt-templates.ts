import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "path";
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
function loadTemplatesFromDir(dir: string, getSourceInfo: (filePath: string) => SourceInfo): PromptTemplate[] {
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
	/** Working directory for project-local templates (when includeProject is true). */
	cwd: string;
	/** Per-supervisor-agent home directory for agent-scoped templates (~/.pi/supervisor/agents/{agentId}). */
	agentHomeDir: string;
	/** Explicit prompt template paths (files or directories). */
	promptPaths: string[];
	/** Include default prompt directories (agent home only). */
	includeDefaults: boolean;
	/** Include cwd/.pi/supervisor/prompts (default true for supervisor only). */
	includeProject?: boolean;
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
 * Load all prompt templates from:
 * 1. Agent home: ~/.pi/supervisor/agents/{agentId}/prompts/
 * 2. Project: cwd/.pi/supervisor/prompts/
 * 3. Explicit prompt paths
 */
export function loadPromptTemplates(options: LoadPromptTemplatesOptions): PromptTemplate[] {
	const resolvedCwd = options.cwd;
	const agentHomeDir = options.agentHomeDir;
	const promptPaths = options.promptPaths;
	const includeDefaults = options.includeDefaults;
	const includeProject = options.includeProject ?? true;

	const templates: PromptTemplate[] = [];

	const agentPromptsDir = join(agentHomeDir, "prompts");
	const projectPromptsDir = resolve(resolvedCwd, ".pi", "supervisor", "prompts");

	const isUnderPath = (target: string, root: string): boolean => {
		const normalizedRoot = resolve(root);
		if (target === normalizedRoot) {
			return true;
		}
		const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
		return target.startsWith(prefix);
	};

	const getSourceInfo = (resolvedPath: string): SourceInfo => {
		if (isUnderPath(resolvedPath, agentPromptsDir)) {
			return createSyntheticSourceInfo(resolvedPath, {
				source: "local",
				scope: "agent",
				baseDir: agentPromptsDir,
			});
		}
		if (isUnderPath(resolvedPath, projectPromptsDir)) {
			return createSyntheticSourceInfo(resolvedPath, {
				source: "local",
				scope: "project",
				baseDir: projectPromptsDir,
			});
		}
		return createSyntheticSourceInfo(resolvedPath, {
			source: "local",
			baseDir: statSync(resolvedPath).isDirectory() ? resolvedPath : dirname(resolvedPath),
		});
	};

	if (includeDefaults) {
		// Only load from agent home dir
		templates.push(...loadTemplatesFromDir(agentPromptsDir, getSourceInfo));
		if (includeProject) {
			templates.push(...loadTemplatesFromDir(projectPromptsDir, getSourceInfo));
		}
	}

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
