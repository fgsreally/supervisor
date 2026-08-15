import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSupervisorHome } from "./supervisor-home.js";

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

/** Prevent multiple Supervisor servers from sharing one SQLite workspace. */
export function acquireRuntimeLock(): RuntimeLock {
  const path = join(getSupervisorHome(), "supervisor.runtime.lock");
  mkdirSync(getSupervisorHome(), { recursive: true });
  if (existsSync(path)) {
    const pid = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
    if (isProcessAlive(pid)) {
      throw new Error(`Supervisor is already running for this workspace (pid ${pid}).`);
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
