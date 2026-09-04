import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getWecodeHome } from "./wecode-home.js";

export interface RuntimeLock {
  path: string;
  release(): void;
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Prevent multiple Wecode servers from sharing one SQLite workspace. */
export function acquireRuntimeLock(): RuntimeLock {
  const suffix =
    process.env.WECODE_RUNTIME_LOCK_SUFFIX?.trim() ??
    (process.env.WECODE_BUILD_PREVIEW === "1" ? "build-preview" : undefined);
  const filename = suffix ? `wecode.runtime.${suffix}.lock` : "wecode.runtime.lock";
  const path = join(getWecodeHome(), filename);
  mkdirSync(getWecodeHome(), { recursive: true });
  if (existsSync(path)) {
    const pid = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
    if (isProcessAlive(pid)) {
      throw new Error(`Wecode is already running for this workspace (pid ${pid}).`);
    }
    unlinkSync(path);
  }

  writeFileSync(path, `${process.pid}\n`, { encoding: "utf8", flag: "wx" });
  let released = false;
  return {
    path,
    release() {
      if (released) return;
      released = true;
      try {
        if (readFileSync(path, "utf8").trim() === String(process.pid)) unlinkSync(path);
      } catch {
        // The lock may already have been removed during shutdown recovery.
      }
    },
  };
}
