import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, basename, extname, isAbsolute, join, resolve } from "node:path";
import { resolveExtensionEntry, readExtensionPackageJson } from "../extension-system/extension-entry.js";

/**
 * When true, session runtime also loads skills / prompts / extensions from `<session.cwd>/.pi/`.
 * Disabled for now; may be re-enabled later.
 */
export const LOAD_PROJECT_RESOURCES = false;

/** Supervisor per-agent homes: ~/.pi/supervisor/agents */
export function getSupervisorAgentsRoot(): string {
	return join(homedir(), ".pi", "supervisor", "agents");
}

/** Global resource catalog: ~/.pi/supervisor/global/{skills,extensions,prompts} */
export function getSupervisorGlobalRoot(): string {
	return join(homedir(), ".pi", "supervisor", "global");
}

export type AgentResourceKind = "skills" | "extensions" | "prompts";

export function getGlobalResourceDirs(): Record<AgentResourceKind, string> {
	const root = getSupervisorGlobalRoot();
	return {
		skills: join(root, "skills"),
		extensions: join(root, "extensions"),
		prompts: join(root, "prompts"),
	};
}

export function ensureGlobalResourceDirs(): string {
	const root = getSupervisorGlobalRoot();
	for (const sub of ["skills", "extensions", "prompts"] as const) {
		mkdirSync(join(root, sub), { recursive: true });
	}
	return root;
}

/**
 * Symlink a global resource entry into an agent home subdirectory.
 * Global skills/extensions are directories; prompts are typically single .md files.
 */
export function linkGlobalResourceToAgent(
	agentHomeDir: string,
	kind: AgentResourceKind,
	globalEntryPath: string,
): string {
	const absoluteSource = resolve(globalEntryPath);
	if (!existsSync(absoluteSource)) {
		throw new Error(`Global resource not found: ${absoluteSource}`);
	}
	const targetDir = join(agentHomeDir, kind);
	mkdirSync(targetDir, { recursive: true });
	const linkName = basename(absoluteSource);
	const linkPath = join(targetDir, linkName);
	if (existsSync(linkPath)) {
		rmSync(linkPath, { recursive: true, force: true });
	}
	const stat = lstatSync(absoluteSource);
	const symlinkType = process.platform === "win32" ? (stat.isDirectory() ? "junction" : "file") : undefined;
	symlinkSync(absoluteSource, linkPath, symlinkType);
	return linkPath;
}

export function getAgentHomeDir(agentId: string | number): string {
	return join(getSupervisorAgentsRoot(), String(agentId));
}

export function ensureAgentHome(agentId: string | number, homeDir?: string): string {
	const root = homeDir ?? getAgentHomeDir(agentId);
	for (const sub of ["skills", "extensions", "prompts"] as const) {
		mkdirSync(join(root, sub), { recursive: true });
	}
	return root;
}

export interface AgentResourceDirs {
	agentHomeDir: string;
	skillsDirs: string[];
	extensionsDirs: string[];
	promptsDirs: string[];
}

export function getAgentResourceDirs(agentId: string | number, homeDir?: string | null): AgentResourceDirs {
	const agentHomeDir = homeDir ?? getAgentHomeDir(agentId);

	const skillsDirs = [join(agentHomeDir, "skills")];
	const extensionsDirs = [join(agentHomeDir, "extensions")];
	const promptsDirs = [join(agentHomeDir, "prompts")];

	return { agentHomeDir, skillsDirs, extensionsDirs, promptsDirs };
}

/** Project-level dirs under session cwd (loaded at runtime; not shown in agent resource API layers). */
export function getProjectResourceDirs(cwd: string): { skills: string; extensions: string; prompts: string } {
	return {
		skills: join(cwd, ".pi", "supervisor", "skills"),
		extensions: join(cwd, ".pi", "supervisor", "extensions"),
		prompts: join(cwd, ".pi", "supervisor", "prompts"),
	};
}

/** Extension entry paths discovered from directories only (no DB). */
export function getExtensionScanDirs(
	agentId: string | number,
	homeDir: string | null,
	cwd: string,
	includeProject: boolean,
): string[] {
	const dirs = getAgentResourceDirs(agentId, homeDir);
	const scan = [...dirs.extensionsDirs];
	if (includeProject && LOAD_PROJECT_RESOURCES) {
		scan.push(getProjectResourceDirs(cwd).extensions);
	}
	return scan;
}

/** Symlink extension source into agent home extensions/ (filesystem only, no DB). */
export function installExtensionToAgentDir(agentHomeDir: string, source: string): { id: string; path: string } {
	const absoluteSource = isAbsolute(source) ? source : resolve(process.cwd(), source);
	if (!existsSync(absoluteSource)) {
		throw new Error(`Extension source not found: ${absoluteSource}`);
	}

	const linkPath = linkGlobalResourceToAgent(agentHomeDir, "extensions", absoluteSource);
	const isFile = extname(absoluteSource) !== "";
	const rootDir = isFile ? dirname(linkPath) : linkPath;
	const entryPath = isFile ? linkPath : resolveExtensionEntry(linkPath);
	if (!entryPath) {
		throw new Error(`Extension directory must contain package.json "main" or index.ts/js: ${absoluteSource}`);
	}

	const pkg = !isFile ? readExtensionPackageJson(linkPath) : null;
	const id = pkg?.name
		? pkg.name.replace(/^@/, "").replace(/\//g, "-")
		: basename(linkPath).replace(extname(linkPath), "");

	return { id, path: entryPath };
}

export function removeExtensionFromAgentDir(agentHomeDir: string, id: string): void {
	const targetRoot = join(agentHomeDir, "extensions");
	const targetDir = join(targetRoot, id);
	const targetFileTs = join(targetRoot, `${id}.ts`);
	const targetFileJs = join(targetRoot, `${id}.js`);
	if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });
	if (existsSync(targetFileTs)) rmSync(targetFileTs, { force: true });
	if (existsSync(targetFileJs)) rmSync(targetFileJs, { force: true });
}

/** Read optional SYSTEM.md from agent home (does not read global). */
export function getAgentSystemMdPath(agentHomeDir: string): string {
	return join(agentHomeDir, "SYSTEM.md");
}

export function readAgentHomeSystemPrompt(agentHomeDir: string): string {
	const path = getAgentSystemMdPath(agentHomeDir);
	if (!existsSync(path)) return "";
	try {
		return readFileSync(path, "utf-8").trim();
	} catch {
		return "";
	}
}

export function writeAgentHomeSystemPrompt(agentHomeDir: string, content: string): void {
	mkdirSync(agentHomeDir, { recursive: true });
	writeFileSync(getAgentSystemMdPath(agentHomeDir), content, "utf-8");
}
