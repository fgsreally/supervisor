import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the built web UI dist directory.
 * Prefer sibling package path from a monorepo checkout; fall back to env.
 */
export function resolveUiDistDir(explicit?: string): string | null {
  if (explicit) {
    const abs = resolve(explicit);
    return existsSync(join(abs, "index.html")) ? abs : null;
  }
  const fromEnv = process.env.PI_SUPERVISOR_UI_DIR?.trim();
  if (fromEnv) {
    const abs = resolve(fromEnv);
    return existsSync(join(abs, "index.html")) ? abs : null;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // packages/supervisor/dist/utils → ../../supervisor-web-ui/dist
    join(here, "..", "..", "..", "supervisor-web-ui", "dist"),
    // packages/supervisor/src/utils (dev/ts)
    join(here, "..", "..", "..", "..", "supervisor-web-ui", "dist"),
    join(process.cwd(), "packages", "supervisor-web-ui", "dist"),
    join(process.cwd(), "supervisor-web-ui", "dist"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "index.html"))) return resolve(candidate);
  }
  return null;
}

export function warnMissingUiDist(): void {
  console.warn(
    "[ui] Web UI dist not found. Run `pnpm run build:all` (or build pi-supervisor-ui) so phones can load the UI from this port.",
  );
}

