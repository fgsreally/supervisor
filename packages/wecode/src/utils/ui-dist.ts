import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeLog } from "../i18n/logs.js";

/**
 * Resolve the built web UI dist directory.
 * Prefer sibling package path from a monorepo checkout; fall back to env.
 */
export function resolveUiDistDir(explicit?: string): string | null {
  if (explicit) {
    const abs = resolve(explicit);
    return existsSync(join(abs, "index.html")) ? abs : null;
  }
  const fromEnv = process.env.WECODE_UI_DIR?.trim();
  if (fromEnv) {
    const abs = resolve(fromEnv);
    return existsSync(join(abs, "index.html")) ? abs : null;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // packages/wecode/dist/utils → ../../wecode-web-ui/dist
    join(here, "..", "..", "..", "wecode-web-ui", "dist"),
    // packages/wecode/src/utils (dev/ts)
    join(here, "..", "..", "..", "..", "wecode-web-ui", "dist"),
    join(process.cwd(), "packages", "wecode-web-ui", "dist"),
    join(process.cwd(), "wecode-web-ui", "dist"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "index.html"))) return resolve(candidate);
  }
  return null;
}

export function warnMissingUiDist(): void {
  writeLog("warn", "runtime.uiDistMissing");
}
