import { spawn, type ChildProcess } from "node:child_process";
import type { Project } from "../types.js";
import { allocatePorts } from "../utils/ports.js";
import { sessionLog } from "../utils/session-log.js";
import type { JobManager } from "./jobs.js";
import type { ProjectScript, ProjectScriptKind } from "./project-scripts.js";
import {
  extractPortPlaceholders,
  PROJECT_RUNTIME_META,
  type ProjectRuntimeStatus,
  type SessionServicesMeta,
} from "./project-runtime.js";

const runningChildren = new Map<string, ChildProcess>();

function substitutePortPlaceholders(command: string, portEnv: Record<string, string>): string {
  let result = command;
  for (const [name, value] of Object.entries(portEnv)) {
    result = result
      .replaceAll(`\${${name}}`, value)
      .replaceAll(`$${name}`, value)
      .replaceAll(`%${name}%`, value);
  }
  return result;
}

async function runShellCommand(
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

function killProcessTree(pid: number): void {
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

function readProjectRuntimeStatus(
  meta: Record<string, unknown> | undefined | null,
): ProjectRuntimeStatus | null {
  const statusRaw = meta?.[PROJECT_RUNTIME_META.status];
  if (
    statusRaw === "ready" ||
    statusRaw === "pending" ||
    statusRaw === "error" ||
    statusRaw === "skipped" ||
    statusRaw === "none"
  ) {
    return statusRaw;
  }
  return null;
}

function childKey(sessionId: number, scriptId: number): string {
  return `${sessionId}:${scriptId}`;
}

/** Build the injected session tip about started scripts. */
export function buildSessionServicesPrompt(services: SessionServicesMeta): string {
  if (services.scripts.length === 0) return "";
  const lines = services.scripts
    .filter((s) => s.kind === "start")
    .map((s) => {
      const job = s.jobId ? ` job=${s.jobId}` : "";
      return `- ${s.name}: \`${s.resolvedCommand}\`${job}`;
    });
  if (lines.length === 0) return "";
  return [
    "本 session 的项目服务已由 Supervisor 按项目脚本启动：",
    ...lines,
    "可用会话 Jobs（kind=project-script）查看各脚本输出；也可用 PersistentBash 在同环境排查。",
    services.portEnv && Object.keys(services.portEnv).length > 0
      ? `已分配端口环境变量：${JSON.stringify(services.portEnv)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Start install/start scripts as session Jobs (bash). */
export async function startSessionProjectServices(options: {
  sessionId: number;
  cwd: string;
  project: Pick<Project, "id" | "meta">;
  scripts: ProjectScript[];
  jobs: JobManager;
}): Promise<SessionServicesMeta | null> {
  const status = readProjectRuntimeStatus(options.project.meta);
  if (status === "pending" || status === "error" || status === "skipped") {
    return null;
  }

  const installScripts = options.scripts.filter((s) => s.kind === "install");
  const startScripts = options.scripts.filter((s) => s.kind === "start");
  if (installScripts.length === 0 && startScripts.length === 0) {
    return null;
  }

  const portNames = [
    ...new Set(startScripts.flatMap((script) => extractPortPlaceholders(script.command))),
  ];
  const portEnv = portNames.length > 0 ? await allocatePorts(portNames) : {};
  const env: NodeJS.ProcessEnv = { ...process.env, ...portEnv };
  const meta: SessionServicesMeta = {
    scripts: [],
    portEnv,
    status: "starting",
    startedAt: new Date().toISOString(),
  };

  try {
    for (const script of installScripts) {
      const resolved = substitutePortPlaceholders(script.command, portEnv);
      const job = options.jobs.create(options.sessionId, {
        kind: "project-script",
        name: `install:${script.name}`,
        label: `install · ${script.name}`,
        status: "running",
        executionMode: "inline",
        capabilities: ["read_output", "cancel"],
        metadata: {
          scriptId: script.id,
          kind: script.kind,
          command: script.command,
          resolvedCommand: resolved,
        },
      });
      sessionLog(options.sessionId, "info", `Running install script: ${resolved}`, [
        "system",
        "services",
      ]);
      let output = "";
      const result = await runShellCommand(resolved, options.cwd, env, {
        timeoutMs: 20 * 60 * 1000,
        onOutput: (chunk) => {
          output += chunk;
          if (output.length > 200_000) output = output.slice(-160_000);
          options.jobs.update(job.id, { output });
        },
      });
      options.jobs.update(job.id, {
        status: result.code === 0 ? "succeeded" : "failed",
        output,
        error: result.code === 0 ? null : { code: result.code },
      });
      meta.scripts.push({
        scriptId: script.id,
        kind: script.kind,
        name: script.name,
        command: script.command,
        resolvedCommand: resolved,
        jobId: job.id,
      });
      if (result.code !== 0) {
        throw new Error(
          `install script "${script.name}" failed (code ${result.code}): ${result.stderr.trim() || result.stdout.trim() || "no output"}`,
        );
      }
    }

    for (const script of startScripts) {
      const resolved = substitutePortPlaceholders(script.command, portEnv);
      const job = options.jobs.create(options.sessionId, {
        kind: "project-script",
        name: `start:${script.name}`,
        label: `start · ${script.name}`,
        status: "running",
        executionMode: "background",
        capabilities: ["read_output", "cancel"],
        metadata: {
          scriptId: script.id,
          kind: script.kind,
          command: script.command,
          resolvedCommand: resolved,
          portEnv,
        },
      });
      sessionLog(
        options.sessionId,
        "info",
        `Starting script: ${resolved}`,
        ["system", "services"],
        { portEnv },
      );
      let output = "";
      const child = spawn(resolved, {
        cwd: options.cwd,
        env,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
      });
      const key = childKey(options.sessionId, script.id);
      runningChildren.set(key, child);
      const append = (chunk: Buffer | string) => {
        output += chunk.toString();
        if (output.length > 200_000) output = output.slice(-160_000);
        options.jobs.update(job.id, { output });
      };
      child.stdout?.on("data", append);
      child.stderr?.on("data", append);
      child.on("exit", (code) => {
        runningChildren.delete(key);
        options.jobs.update(job.id, {
          status: code === 0 ? "succeeded" : "failed",
          output,
          error: code === 0 ? undefined : { code },
        });
      });
      options.jobs.setCancelHandler(job.id, () => {
        if (child.pid) killProcessTree(child.pid);
      });
      if (process.platform !== "win32") child.unref();
      meta.scripts.push({
        scriptId: script.id,
        kind: script.kind,
        name: script.name,
        command: script.command,
        resolvedCommand: resolved,
        jobId: job.id,
        pid: child.pid ?? null,
      });
    }

    meta.status = "running";
    return meta;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    meta.status = "error";
    meta.error = message;
    sessionLog(options.sessionId, "error", `Project services failed: ${message}`, [
      "system",
      "services",
    ]);
    throw error;
  }
}

/** Run destroy scripts and kill tracked start processes. */
export async function stopSessionProjectServices(options: {
  sessionId: number;
  cwd: string;
  services: SessionServicesMeta | null | undefined;
  destroyScripts?: ProjectScript[];
  jobs?: JobManager;
}): Promise<void> {
  const services = options.services;
  const portEnv = services?.portEnv ?? {};
  const env: NodeJS.ProcessEnv = { ...process.env, ...portEnv };

  for (const script of options.destroyScripts ?? []) {
    const resolved = substitutePortPlaceholders(script.command, portEnv);
    sessionLog(options.sessionId, "info", `Running destroy script: ${resolved}`, [
      "system",
      "services",
    ]);
    let jobId: string | undefined;
    if (options.jobs) {
      const job = options.jobs.create(options.sessionId, {
        kind: "project-script",
        name: `destroy:${script.name}`,
        label: `destroy · ${script.name}`,
        status: "running",
        executionMode: "inline",
        capabilities: ["read_output"],
        metadata: {
          scriptId: script.id,
          kind: "destroy" satisfies ProjectScriptKind,
          command: script.command,
          resolvedCommand: resolved,
        },
      });
      jobId = job.id;
    }
    try {
      let output = "";
      const result = await runShellCommand(resolved, options.cwd, env, {
        timeoutMs: 60_000,
        onOutput: (chunk) => {
          output += chunk;
          if (jobId && options.jobs) options.jobs.update(jobId, { output });
        },
      });
      if (jobId && options.jobs) {
        options.jobs.update(jobId, {
          status: result.code === 0 ? "succeeded" : "failed",
          output,
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sessionLog(options.sessionId, "warn", `destroy script error: ${message}`, [
        "system",
        "services",
      ]);
      if (jobId && options.jobs) {
        options.jobs.update(jobId, { status: "failed", error: { message } });
      }
    }
  }

  for (const entry of services?.scripts ?? []) {
    if (entry.kind !== "start") continue;
    const key = childKey(options.sessionId, entry.scriptId);
    const child = runningChildren.get(key);
    const pid = child?.pid ?? entry.pid ?? null;
    if (pid) {
      sessionLog(options.sessionId, "info", `Killing script process pid=${pid}`, [
        "system",
        "services",
      ]);
      killProcessTree(pid);
    }
    runningChildren.delete(key);
    if (entry.jobId && options.jobs) {
      const job = options.jobs.get(entry.jobId);
      if (job && (job.status === "running" || job.status === "waiting")) {
        options.jobs.update(entry.jobId, { status: "cancelled" });
      }
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

export function sessionServicePortEnv(
  meta: Record<string, unknown> | undefined | null,
): Record<string, string> {
  return parseSessionServicesMeta(meta)?.portEnv ?? {};
}

export function parseSessionServicesMeta(
  meta: Record<string, unknown> | undefined | null,
): SessionServicesMeta | null {
  const raw = meta?.services;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const portEnv =
    row.portEnv && typeof row.portEnv === "object" && !Array.isArray(row.portEnv)
      ? Object.fromEntries(
          Object.entries(row.portEnv as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string" || typeof value === "number")
            .map(([key, value]) => [key, String(value)]),
        )
      : {};
  const status = row.status;
  if (
    status !== "starting" &&
    status !== "running" &&
    status !== "stopped" &&
    status !== "error"
  ) {
    return null;
  }
  const scripts: SessionServicesMeta["scripts"] = [];
  if (Array.isArray(row.scripts)) {
    for (const item of row.scripts) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;
      const kind = s.kind;
      if (kind !== "install" && kind !== "start" && kind !== "destroy") continue;
      if (typeof s.scriptId !== "number" || typeof s.command !== "string") continue;
      scripts.push({
        scriptId: s.scriptId,
        kind,
        name: typeof s.name === "string" ? s.name : kind,
        command: s.command,
        resolvedCommand:
          typeof s.resolvedCommand === "string" ? s.resolvedCommand : s.command,
        jobId: typeof s.jobId === "string" ? s.jobId : undefined,
        pid: typeof s.pid === "number" ? s.pid : null,
      });
    }
  }
  return {
    scripts,
    portEnv,
    startedAt: typeof row.startedAt === "string" ? row.startedAt : undefined,
    status,
    error: typeof row.error === "string" ? row.error : undefined,
  };
}
