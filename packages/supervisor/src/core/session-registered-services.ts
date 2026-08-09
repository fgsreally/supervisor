import type { JobManager } from "./jobs.js";
import type { CreateJobInput, UpdateJobInput } from "./jobs.js";
import {
  extractPortPlaceholders,
  type SessionServicesMeta,
  type SessionUiPort,
} from "./project-runtime.js";
import { computeServiceSleepAt } from "./session-service-sleep.js";
import {
  killProcessTree,
  runShellCommand,
  substitutePortPlaceholders,
  type RunningServiceKey,
  runningChildren,
  childKeyByName,
} from "./session-service-runtime.js";
import { allocatePorts } from "../utils/ports.js";
import { sessionLog } from "../utils/session-log.js";
import { spawn, type ChildProcess } from "node:child_process";

export interface RegisteredServiceEntry {
  name: string;
  installCommand?: string;
  startCommand: string;
  stopCommand?: string;
  destroyCommand?: string;
  uninstallCommand?: string;
  uiPorts?: Array<{ envVar: string; label?: string; path?: string }>;
  resolvedStartCommand?: string;
  jobId?: string;
  pid?: number | null;
}

export function flattenUiPorts(entries: RegisteredServiceEntry[]): SessionUiPort[] {
  const result: SessionUiPort[] = [];
  for (const entry of entries) {
    for (const port of entry.uiPorts ?? []) {
      const envVar = port.envVar.trim();
      if (!envVar) continue;
      result.push({
        scriptName: entry.name,
        envVar,
        label: port.label ?? entry.name,
        path: port.path ?? "/",
      });
    }
  }
  return result;
}

export function parseRegisteredServiceEntries(
  services: SessionServicesMeta | null | undefined,
): RegisteredServiceEntry[] {
  if (!services?.entries?.length) return [];
  return services.entries;
}

export function areRegisteredServicesAlive(
  entries: RegisteredServiceEntry[],
  portEnv: Record<string, string>,
): boolean {
  for (const entry of entries) {
    if (entry.pid && isPidAlive(entry.pid)) return true;
    for (const port of entry.uiPorts ?? []) {
      const value = portEnv[port.envVar.trim()];
      const portNum = value ? Number.parseInt(value, 10) : NaN;
      if (Number.isFinite(portNum) && portNum > 0) {
        // Best-effort: if we still have a pid map entry, treat as alive.
        if (entry.pid) return isPidAlive(entry.pid);
      }
    }
  }
  return entries.some((entry) => entry.pid != null && isPidAlive(entry.pid));
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface SessionServiceJobHost {
  create(sessionId: number, input: CreateJobInput): Promise<{ id: string }>;
  update(id: string, patch: UpdateJobInput): Promise<void>;
  get(id: string): Promise<{ status: string } | undefined>;
  setCancelHandler(id: string, handler: () => void | Promise<void>): void;
}

export function jobManagerAsHost(jobs: JobManager): SessionServiceJobHost {
  return {
    create(sessionId, input) {
      return Promise.resolve(jobs.create(sessionId, input));
    },
    async update(id, patch) {
      jobs.update(id, patch);
    },
    async get(id) {
      return jobs.get(id);
    },
    setCancelHandler(id, handler) {
      jobs.setCancelHandler(id, handler);
    },
  };
}

/** Start registered service commands from session meta. */
export async function startRegisteredSessionServices(options: {
  sessionId: number;
  cwd: string;
  services: SessionServicesMeta;
  jobs: SessionServiceJobHost;
  skipInstall?: boolean;
  lastActiveAtMs?: number;
}): Promise<SessionServicesMeta> {
  const entries = [...(options.services.entries ?? [])];
  if (entries.length === 0) {
    throw new Error("尚未注册项目服务命令");
  }

  const startCommands = entries.map((entry) => entry.startCommand);
  const portNames = [
    ...new Set(startCommands.flatMap((command) => extractPortPlaceholders(command))),
  ];
  const portEnv = portNames.length > 0 ? await allocatePorts(portNames) : {};
  const env: NodeJS.ProcessEnv = { ...process.env, ...portEnv };

  const meta: SessionServicesMeta = {
    ...options.services,
    entries,
    portEnv,
    uiPorts: flattenUiPorts(entries),
    status: "starting",
    startedAt: new Date().toISOString(),
  };

  try {
    if (!options.skipInstall) {
      for (const entry of entries) {
        const install = entry.installCommand?.trim();
        if (!install) continue;
        const resolved = substitutePortPlaceholders(install, portEnv);
        const job = await options.jobs.create(options.sessionId, {
          kind: "project-service",
          name: `install:${entry.name}`,
          label: `install · ${entry.name}`,
          status: "running",
          executionMode: "inline",
          capabilities: ["read_output", "cancel"],
          metadata: { serviceName: entry.name, command: install, resolvedCommand: resolved },
        });
        let output = "";
        const result = await runShellCommand(resolved, options.cwd, env, {
          timeoutMs: 20 * 60 * 1000,
          onOutput: (chunk) => {
            output += chunk;
            if (output.length > 200_000) output = output.slice(-160_000);
            void options.jobs.update(job.id, { output });
          },
        });
        await options.jobs.update(job.id, {
          status: result.code === 0 ? "succeeded" : "failed",
          output,
          error: result.code === 0 ? null : { code: result.code },
        });
        if (result.code !== 0) {
          throw new Error(
            `install "${entry.name}" failed (code ${result.code}): ${result.stderr.trim() || result.stdout.trim() || "no output"}`,
          );
        }
      }
      meta.installedAt = new Date().toISOString();
    }

    for (const entry of entries) {
      const resolved = substitutePortPlaceholders(entry.startCommand, portEnv);
      const job = await options.jobs.create(options.sessionId, {
        kind: "project-service",
        name: `start:${entry.name}`,
        label: `start · ${entry.name}`,
        status: "running",
        executionMode: "background",
        capabilities: ["read_output", "cancel"],
        metadata: {
          serviceName: entry.name,
          command: entry.startCommand,
          resolvedCommand: resolved,
          portEnv,
        },
      });
      sessionLog(
        options.sessionId,
        "info",
        `Starting service: ${resolved}`,
        ["system", "services"],
        {
          portEnv,
        },
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
      const key = childKeyByName(options.sessionId, entry.name);
      runningChildren.set(key, child);
      const append = (chunk: Buffer | string) => {
        output += chunk.toString();
        if (output.length > 200_000) output = output.slice(-160_000);
        void options.jobs.update(job.id, { output });
      };
      child.stdout?.on("data", append);
      child.stderr?.on("data", append);
      child.on("exit", (code) => {
        runningChildren.delete(key);
        void options.jobs.update(job.id, {
          status: code === 0 ? "succeeded" : "failed",
          output,
          error: code === 0 ? undefined : { code },
        });
      });
      options.jobs.setCancelHandler(job.id, () => {
        if (child.pid) killProcessTree(child.pid);
      });
      if (process.platform !== "win32") child.unref();
      entry.resolvedStartCommand = resolved;
      entry.jobId = job.id;
      entry.pid = child.pid ?? null;
    }

    meta.entries = entries;
    meta.status = "active";
    meta.lastActiveAt = options.lastActiveAtMs ?? Date.now();
    meta.sleepAt = computeServiceSleepAt(meta.lastActiveAt);
    return meta;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    meta.status = "error";
    meta.error = message;
    sessionLog(options.sessionId, "error", `Registered services failed: ${message}`, [
      "system",
      "services",
    ]);
    throw error;
  }
}

/** Stop or destroy registered services. */
export async function stopRegisteredSessionServices(options: {
  sessionId: number;
  cwd: string;
  services: SessionServicesMeta | null | undefined;
  jobs?: SessionServiceJobHost;
  mode?: "stop" | "destroy" | "uninstall";
}): Promise<void> {
  const services = options.services;
  if (!services?.entries?.length) return;
  const portEnv = services.portEnv ?? {};
  const env: NodeJS.ProcessEnv = { ...process.env, ...portEnv };
  const mode = options.mode ?? "stop";

  for (const entry of services.entries) {
    const uninstall = entry.uninstallCommand?.trim() ?? entry.destroyCommand?.trim();
    const command =
      mode === "uninstall" || mode === "destroy"
        ? uninstall
        : (entry.stopCommand?.trim() ?? uninstall);
    if (!command) continue;
    const resolved = substitutePortPlaceholders(command, portEnv);
    sessionLog(options.sessionId, "info", `Running ${mode} for ${entry.name}: ${resolved}`, [
      "system",
      "services",
    ]);
    let jobId: string | undefined;
    if (options.jobs) {
      const job = await options.jobs.create(options.sessionId, {
        kind: "project-service",
        name: `${mode}:${entry.name}`,
        label: `${mode} · ${entry.name}`,
        status: "running",
        executionMode: "inline",
        capabilities: ["read_output"],
        metadata: { serviceName: entry.name, command, resolvedCommand: resolved },
      });
      jobId = job.id;
    }
    try {
      let output = "";
      const result = await runShellCommand(resolved, options.cwd, env, {
        timeoutMs: 60_000,
        onOutput: (chunk) => {
          output += chunk;
          if (jobId && options.jobs) void options.jobs.update(jobId, { output });
        },
      });
      if (jobId && options.jobs) {
        await options.jobs.update(jobId, {
          status: result.code === 0 ? "succeeded" : "failed",
          output,
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sessionLog(options.sessionId, "warn", `${mode} script error: ${message}`, [
        "system",
        "services",
      ]);
      if (jobId && options.jobs) {
        await options.jobs.update(jobId, { status: "failed", error: { message } });
      }
    }
  }

  for (const entry of services.entries) {
    const key = childKeyByName(options.sessionId, entry.name);
    const child = runningChildren.get(key);
    const pid = child?.pid ?? entry.pid ?? null;
    if (pid) {
      sessionLog(options.sessionId, "info", `Killing service pid=${pid}`, ["system", "services"]);
      killProcessTree(pid);
    }
    runningChildren.delete(key);
    if (entry.jobId && options.jobs) {
      const job = await options.jobs.get(entry.jobId);
      if (job && (job.status === "running" || job.status === "waiting")) {
        await options.jobs.update(entry.jobId, { status: "cancelled" });
      }
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

export type { RunningServiceKey, ChildProcess };
