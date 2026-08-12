import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { platform } from "node:os";
import path from "node:path";

export type OpenPathResult =
  | { ok: true; path: string }
  | { ok: false; error: string; path?: string };

/** Whether an absolute path exists on the supervisor host filesystem. */
export function pathExistsOnHost(targetPath: string): { exists: boolean; path: string | null } {
  const raw = targetPath?.trim();
  if (!raw) return { exists: false, path: null };
  const resolved = path.resolve(raw);
  if (!path.isAbsolute(resolved)) return { exists: false, path: resolved };
  return { exists: existsSync(resolved), path: resolved };
}

/**
 * Reveal a path in the host OS file manager (Explorer / Finder / xdg-open).
 * Opens the directory itself, or the parent folder when the path is a file.
 */
export function openPathInFileManager(targetPath: string): OpenPathResult {
  const checked = pathExistsOnHost(targetPath);
  if (!checked.path) return { ok: false, error: "路径为空" };
  const resolved = checked.path;
  if (!path.isAbsolute(resolved)) {
    return { ok: false, error: "仅支持绝对路径", path: resolved };
  }
  if (!checked.exists) {
    return { ok: false, error: "路径不存在（可能不在本机）", path: resolved };
  }

  let openTarget = resolved;
  try {
    if (!statSync(resolved).isDirectory()) {
      openTarget = path.dirname(resolved);
    }
  } catch {
    return { ok: false, error: "无法访问路径", path: resolved };
  }

  const os = platform();
  try {
    if (os === "win32") {
      // explorer fails with non-zero exit even on success; detach and ignore status.
      spawn("explorer.exe", [openTarget], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
    } else if (os === "darwin") {
      spawn("open", [openTarget], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [openTarget], { detached: true, stdio: "ignore" }).unref();
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      path: resolved,
    };
  }

  return { ok: true, path: resolved };
}
