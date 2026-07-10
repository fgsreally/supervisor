import { realpathSync } from "node:fs";

/**
 * Resolve a path to its canonical (real) form, following symlinks.
 * Falls back to the raw path if resolution fails (e.g. the target does
 * not exist yet), so that callers never crash on missing filesystem entries.
 */
export function canonicalizePath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}
