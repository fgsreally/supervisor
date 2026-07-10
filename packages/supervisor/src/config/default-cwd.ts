import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let defaultCwd: string | null = null;

function packageRootCandidates(): string[] {
	const moduleDir = dirname(fileURLToPath(import.meta.url));
	return [
		resolve(moduleDir, "../../../playground"),
		resolve(moduleDir, "../../../../playground"),
		resolve(process.cwd(), "playground"),
	];
}

/** Resolve playground path when present in the monorepo layout. */
export function resolvePlaygroundPath(): string | null {
	for (const candidate of packageRootCandidates()) {
		if (existsSync(resolve(candidate, "TASK.md"))) return candidate;
	}
	return null;
}

export function resolveWorkspacePath(cwd: string): string {
	return resolve(cwd);
}

export function setDefaultCwd(cwd: string): void {
	defaultCwd = resolveWorkspacePath(cwd);
}

/** Default session workspace directory for supervisor runtime. */
export function getDefaultCwd(): string {
	if (defaultCwd) return defaultCwd;
	const fromEnv = process.env.SS_CWD?.trim();
	if (fromEnv) return resolveWorkspacePath(fromEnv);
	const playground = resolvePlaygroundPath();
	if (playground) return playground;
	return process.cwd();
}
