import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionRuntime } from "../extension-system/runtime.js";
import {
	activatePackagedTool,
	isPackagedToolId,
	PACKAGED_TOOL_IDS,
	type PackagedToolId,
} from "./catalog.js";

/** Directory containing supervisor-shipped packaged tools. */
export function getPackagedToolsDir(): string {
	const here = fileURLToPath(new URL(".", import.meta.url));
	return here;
}

export function listPackagedToolIds(): PackagedToolId[] {
	return [...PACKAGED_TOOL_IDS];
}

export function getPackagedToolDir(id: PackagedToolId): string {
	return join(getPackagedToolsDir(), id);
}

/**
 * List packaged tools enabled for an agent.
 * New layout: `<agentHome>/tools/<id>` marker files.
 * Legacy: `<agentHome>/extensions/<id>` symlinks from the old packaged-extension layout.
 */
export function listEnabledPackagedToolIds(agentHomeDir: string): PackagedToolId[] {
	const enabled = new Set<PackagedToolId>();

	const toolsDir = join(agentHomeDir, "tools");
	if (existsSync(toolsDir)) {
		for (const entry of readdirSync(toolsDir, { withFileTypes: true })) {
			if (isPackagedToolId(entry.name)) {
				enabled.add(entry.name);
			}
		}
	}

	const extensionsDir = join(agentHomeDir, "extensions");
	if (existsSync(extensionsDir)) {
		for (const entry of readdirSync(extensionsDir, { withFileTypes: true })) {
			if (isPackagedToolId(entry.name)) {
				enabled.add(entry.name);
			}
		}
	}

	return [...enabled];
}

export function enablePackagedToolForAgent(agentHomeDir: string, toolId: PackagedToolId): string {
	const toolsDir = join(agentHomeDir, "tools");
	mkdirSync(toolsDir, { recursive: true });
	const marker = join(toolsDir, toolId);
	writeFileSync(marker, `${toolId}\n`, "utf-8");
	return marker;
}

export function isLegacyPackagedToolExtensionDir(dirPath: string): boolean {
	return isPackagedToolId(basename(dirPath));
}

export async function activatePackagedTools(
	runtime: ExtensionRuntime,
	options: { cwd: string; sessionId: number; toolIds: PackagedToolId[] },
): Promise<() => Promise<void>> {
	const cleanups: Array<() => void | Promise<void>> = [];

	for (const id of options.toolIds) {
		try {
			const activation = await activatePackagedTool(id, options);
			for (const tool of activation.tools) {
				runtime.registerPackagedTool(id, tool, activation.pausing);
			}
			activation.attachHooks?.(runtime);
			if (activation.cleanup) {
				cleanups.push(activation.cleanup);
			}
		} catch (error: unknown) {
			runtime.logPackagedToolWarning(id, error);
		}
	}

	return async () => {
		for (const cleanup of cleanups) {
			await cleanup();
		}
	};
}
