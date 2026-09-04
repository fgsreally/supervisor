import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { getWecodeHome } from "../utils/wecode-home.js";

export function getGlobalResourceRoot(): string {
  return join(getWecodeHome(), "global");
}

export function getGlobalResourceDirectory(directoryName: string): string {
  if (
    !directoryName ||
    directoryName === "." ||
    directoryName === ".." ||
    /[/\\]/.test(directoryName)
  ) {
    throw new Error(`Invalid resource directory name: ${directoryName}`);
  }
  if (directoryName === "plugins") migrateLegacyPluginsDirectory();
  return join(getGlobalResourceRoot(), directoryName);
}

function migrateLegacyPluginsDirectory(): void {
  const root = getGlobalResourceRoot();
  const legacy = join(root, "extensions");
  const next = join(root, "plugins");
  if (existsSync(legacy) && !existsSync(next)) renameSync(legacy, next);
}

export function ensureGlobalResourceRoot(): string {
  const root = getGlobalResourceRoot();
  mkdirSync(root, { recursive: true });
  return root;
}

export function ensureGlobalResourceDirectory(directoryName: string): string {
  const directory = getGlobalResourceDirectory(directoryName);
  mkdirSync(directory, { recursive: true });
  return directory;
}
