import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SessionPluginHost } from "../plugin/runtime/index.js";
import { activatePackagedTool, PACKAGED_TOOL_IDS, type PackagedToolId } from "./catalog.js";

/** Directory containing wecode-shipped packaged tools. */
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

export async function activatePackagedTools(
  plugin: SessionPluginHost,
  options: { cwd: string; sessionId: number; sessionDir?: string; toolIds: PackagedToolId[] },
): Promise<() => Promise<void>> {
  const cleanups: Array<() => void | Promise<void>> = [];

  for (const id of options.toolIds) {
    try {
      const activation = await activatePackagedTool(id, options);
      for (const tool of activation.tools) {
        plugin.registerPackagedTool(id, tool, activation.pausing);
      }
      activation.attachHooks?.(plugin);
      if (activation.cleanup) {
        cleanups.push(activation.cleanup);
      }
    } catch (error: unknown) {
      plugin.logPackagedToolWarning(id, error);
    }
  }

  return async () => {
    for (const cleanup of cleanups) {
      await cleanup();
    }
  };
}
