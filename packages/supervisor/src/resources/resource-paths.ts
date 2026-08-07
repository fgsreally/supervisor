import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getSupervisorHome } from "../utils/supervisor-home.js";

export function getGlobalResourceRoot(): string {
  return join(getSupervisorHome(), "global");
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
  return join(getGlobalResourceRoot(), directoryName);
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
