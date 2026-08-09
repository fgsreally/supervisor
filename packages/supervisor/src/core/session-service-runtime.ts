import { spawn, type ChildProcess } from "node:child_process";

export type RunningServiceKey = string;

export const runningChildren = new Map<RunningServiceKey, ChildProcess>();

export function childKeyByName(sessionId: number, name: string): RunningServiceKey {
  return `${sessionId}:${name}`;
}

export function substitutePortPlaceholders(
  command: string,
  portEnv: Record<string, string>,
): string {
  let result = command;
  for (const [name, value] of Object.entries(portEnv)) {
    result = result
      .replaceAll(`\${${name}}`, value)
      .replaceAll(`$${name}`, value)
      .replaceAll(`%${name}%`, value);
  }
  return result;
}

export async function runShellCommand(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  options?: {
    timeoutMs?: number;
    onOutput?: (chunk: string) => void;
  },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = options?.timeoutMs;
    const timer =
      timeoutMs && timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return;
            child.kill("SIGTERM");
            setTimeout(() => {
              if (!child.killed) child.kill("SIGKILL");
            }, 3000);
          }, timeoutMs)
        : undefined;

    const push = (chunk: Buffer | string, stream: "stdout" | "stderr") => {
      const text = chunk.toString();
      if (stream === "stdout") {
        stdout += text;
        if (stdout.length > 200_000) stdout = stdout.slice(-160_000);
      } else {
        stderr += text;
        if (stderr.length > 200_000) stderr = stderr.slice(-160_000);
      }
      options?.onOutput?.(text);
    };

    child.stdout?.on("data", (chunk: Buffer | string) => push(chunk, "stdout"));
    child.stderr?.on("data", (chunk: Buffer | string) => push(chunk, "stderr"));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function killProcessTree(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      return;
    }
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      process.kill(pid, "SIGTERM");
    }
    setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // already gone
        }
      }
    }, 2000);
  } catch {
    // ignore
  }
}
