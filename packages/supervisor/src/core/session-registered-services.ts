import type { JobManager } from "./jobs.js";
import type { CreateJobInput, UpdateJobInput } from "./jobs.js";
import {
  extractPortPlaceholders,
  type SessionServiceApp,
  type SessionServicesMeta,
} from "./project-runtime.js";
import { computeServiceSleepAt } from "./session-service-sleep.js";
import {
  runShellCommand,
  substitutePortPlaceholders,
  type RunningServiceKey,
  runningChildren,
  childKeyByName,
} from "./session-service-runtime.js";
import { killProcessTree } from "../utils/process-tree.js";
import { allocatePorts } from "../utils/ports.js";
import { sessionLog } from "../utils/session-log.js";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Legacy multi-entry shape kept only for parse migration. */
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

const MAIN_SERVICE_NAME = "main";

export function findProjectBinDir(cwd: string): string | undefined {
  let current = cwd;
  for (;;) {
    const candidate = join(current, "node_modules", ".bin");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function withProjectPath(cwd: string, source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const projectBin = findProjectBinDir(cwd);
  const env = { ...source };
  if (projectBin) {
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
    const currentPath = env[pathKey]?.trim();
    env[pathKey] = currentPath
      ? `${projectBin}${process.platform === "win32" ? ";" : ":"}${currentPath}`
      : projectBin;
  }
  if (process.platform === "win32") {
    const dnsOption = "--dns-result-order=ipv4first";
    const nodeOptions = env.NODE_OPTIONS?.trim() ?? "";
    if (!nodeOptions.includes("--dns-result-order")) {
      env.NODE_OPTIONS = nodeOptions ? `${nodeOptions} ${dnsOption}` : dnsOption;
    }
  }
  return env;
}

export function hasRegisteredServices(
  services: SessionServicesMeta | null | undefined,
): services is SessionServicesMeta {
  if (!services) return false;
  if (services.startCommand?.trim()) return true;
  return Boolean(services.apps?.some((app) => app.startCommand?.trim() || app.port > 0));
}

export function appStartCommand(app: SessionServiceApp, services: SessionServicesMeta): string {
  return app.startCommand?.trim() || services.startCommand?.trim() || "";
}

export function appsToPortEnv(apps: SessionServiceApp[] | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  for (const app of apps ?? []) {
    for (const [name, port] of Object.entries(app.portEnv ?? {})) {
      if (/^PORT[1-9]\d*$/.test(name) && Number.isInteger(port) && port > 0) {
        env[name] = String(port);
      }
    }
    const upper = app.name.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
    if (!upper) continue;
    env[`${upper}_PORT`] = String(app.port);
    env[upper] = String(app.port);
  }
  if (apps?.[0]) env.PORT = String(apps[0].port);
  return env;
}

/** Prefer `isSessionServiceProcessAlive(sessionId, services)` when sessionId is known. */
export function areRegisteredServicesAlive(
  services: SessionServicesMeta | null | undefined,
): boolean {
  if (!services?.pid) return false;
  return isPidAlive(services.pid);
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

export function isSessionServiceProcessAlive(
  sessionId: number,
  services: SessionServicesMeta | null | undefined,
): boolean {
  if (!services) return false;
  const main = runningChildren.get(childKeyByName(sessionId, MAIN_SERVICE_NAME));
  if (main?.pid && isPidAlive(main.pid)) return true;
  for (const app of services.apps ?? []) {
    if (isAppProcessAlive(sessionId, app)) return true;
  }
  if (services.pid && isPidAlive(services.pid)) return true;
  return false;
}

export function isAppProcessAlive(sessionId: number, app: SessionServiceApp | undefined): boolean {
  if (!app) return false;
  const child = runningChildren.get(childKeyByName(sessionId, app.name));
  if (child?.pid && isPidAlive(child.pid)) return true;
  if (app.pid && isPidAlive(app.pid)) return true;
  return false;
}

export interface SessionServiceJobHost {
  create(sessionId: number, input: CreateJobInput): Promise<{ id: string }>;
  update(id: string, patch: UpdateJobInput): Promise<void>;
  get(id: string): Promise<
    | {
        id: string;
        status: string;
        output?: string;
        metadata?: Record<string, unknown>;
      }
    | undefined
  >;
  cancel?(id: string): Promise<unknown>;
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
      const job = jobs.get(id);
      if (!job) return undefined;
      return { id: job.id, status: job.status, output: job.output, metadata: job.metadata };
    },
    async cancel(id) {
      return jobs.cancel(id);
    },
    setCancelHandler(id, handler) {
      jobs.setCancelHandler(id, handler);
    },
  };
}

async function resolvePortEnv(services: SessionServicesMeta): Promise<{
  portEnv: Record<string, string>;
  apps: SessionServiceApp[];
}> {
  const apps = [...(services.apps ?? [])];
  const portEnv = appsToPortEnv(apps);
  const commands = [
    services.installCommand,
    services.startCommand,
    services.stopCommand,
    services.destroyCommand ?? services.uninstallCommand,
  ];
  const needed = [
    ...new Set(commands.flatMap((command) => extractPortPlaceholders(command))),
  ].filter((name) => !portEnv[name]);

  if (needed.length > 0) {
    const allocated = await allocatePorts(needed);
    Object.assign(portEnv, allocated);
    for (const [name, value] of Object.entries(allocated)) {
      const port = Number.parseInt(value, 10);
      if (!Number.isFinite(port) || port <= 0) continue;
      if (name === "PORT" && apps[0]) {
        apps[0] = { ...apps[0], port };
        continue;
      }
      const appName = name.endsWith("_PORT") ? name.slice(0, -5) : name;
      const idx = apps.findIndex(
        (app) => app.name.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase() === appName,
      );
      if (idx >= 0) apps[idx] = { ...apps[idx]!, port };
      else if (name === "PORT" && apps.length === 0) {
        apps.push({ name: "web", port, path: "/" });
      }
    }
  }

  return { portEnv, apps };
}

export async function stopRegisteredApp(options: {
  sessionId: number;
  app: SessionServiceApp;
  jobs?: SessionServiceJobHost;
}): Promise<void> {
  const key = childKeyByName(options.sessionId, options.app.name);
  const child = runningChildren.get(key);
  const pid = child?.pid ?? options.app.pid ?? null;
  if (pid) {
    sessionLog(options.sessionId, "info", `Killing service ${options.app.name} pid=${pid}`, [
      "system",
      "services",
    ]);
    await killProcessTree(pid);
  }
  runningChildren.delete(key);
  const jobId = options.app.jobId;
  if (jobId && options.jobs) {
    const job = await options.jobs.get(jobId);
    if (job && (job.status === "running" || job.status === "waiting")) {
      if (typeof options.jobs.cancel === "function") {
        await options.jobs.cancel(jobId).catch(() => undefined);
      } else {
        await options.jobs.update(jobId, { status: "cancelled" });
      }
    }
  }
}

export async function startRegisteredApp(options: {
  sessionId: number;
  cwd: string;
  services: SessionServicesMeta;
  app: SessionServiceApp;
  jobs: SessionServiceJobHost;
}): Promise<SessionServiceApp> {
  const startCommand = appStartCommand(options.app, options.services);
  if (!startCommand) throw new Error(`服务 ${options.app.name} 缺少 startCommand`);

  const { portEnv, apps } = await resolvePortEnv({
    ...options.services,
    apps: options.services.apps?.map((item) =>
      item.name === options.app.name ? { ...item, ...options.app } : item,
    ) ?? [options.app],
  });
  for (const [name, port] of Object.entries(options.app.portEnv ?? {})) {
    portEnv[name] = String(port);
  }
  const env: NodeJS.ProcessEnv = withProjectPath(options.cwd, { ...process.env, ...portEnv });
  const resolved = substitutePortPlaceholders(startCommand, portEnv);
  const job = await options.jobs.create(options.sessionId, {
    kind: "project-service",
    name: `start:${options.app.name}`,
    label: `start · ${options.app.name}`,
    status: "running",
    executionMode: "background",
    capabilities: ["read_output", "cancel"],
    metadata: {
      command: startCommand,
      resolvedCommand: resolved,
      cwd: options.cwd,
      apps,
      app: options.app.name,
    },
  });
  sessionLog(options.sessionId, "info", `Starting ${options.app.name}: ${resolved}`, [
    "system",
    "services",
  ]);
  let output = "";
  const child = spawn(resolved, {
    cwd: options.cwd,
    env,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  await options.jobs.update(job.id, {
    metadata: { pid: child.pid, pidStartedAt: Date.now() },
  });
  const key = childKeyByName(options.sessionId, options.app.name);
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
    return child.pid ? killProcessTree(child.pid) : undefined;
  });
  if (process.platform !== "win32") child.unref();

  return {
    ...options.app,
    startCommand,
    jobId: job.id,
    pid: child.pid ?? null,
  };
}

/** Start registered apps that are not already running. */
export async function startRegisteredSessionServices(options: {
  sessionId: number;
  cwd: string;
  services: SessionServicesMeta;
  jobs: SessionServiceJobHost;
  skipInstall?: boolean;
  lastActiveAtMs?: number;
}): Promise<SessionServicesMeta> {
  if (!hasRegisteredServices(options.services)) {
    throw new Error("尚未注册项目服务命令");
  }

  const { portEnv, apps } = await resolvePortEnv(options.services);
  const env: NodeJS.ProcessEnv = withProjectPath(options.cwd, { ...process.env, ...portEnv });
  const meta: SessionServicesMeta = {
    ...options.services,
    apps: apps.map((app, index) =>
      app.startCommand?.trim() || index > 0
        ? app
        : { ...app, startCommand: options.services.startCommand },
    ),
    status: "starting",
    startedAt: new Date().toISOString(),
    error: undefined,
  };

  try {
    if (!options.skipInstall) {
      const install = meta.installCommand?.trim();
      if (install) {
        meta.installCommand = install;
        const resolved = substitutePortPlaceholders(install, portEnv);
        const job = await options.jobs.create(options.sessionId, {
          kind: "project-service",
          name: "install:main",
          label: "install · project",
          status: "running",
          executionMode: "inline",
          capabilities: ["read_output", "cancel"],
          metadata: { command: install, resolvedCommand: resolved },
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
            `install failed (code ${result.code}): ${result.stderr.trim() || result.stdout.trim() || "no output"}`,
          );
        }
        meta.installedAt = new Date().toISOString();
      }
    }

    const nextApps: SessionServiceApp[] = [];
    for (const app of meta.apps ?? []) {
      if (isAppProcessAlive(options.sessionId, app)) {
        nextApps.push(app);
        continue;
      }
      if (!appStartCommand(app, meta)) {
        nextApps.push(app);
        continue;
      }
      nextApps.push(
        await startRegisteredApp({
          sessionId: options.sessionId,
          cwd: options.cwd,
          services: { ...meta, apps: meta.apps },
          app,
          jobs: options.jobs,
        }),
      );
    }

    const first = nextApps.find((app) => app.jobId) ?? nextApps[0];
    meta.apps = nextApps;
    meta.startCommand = first?.startCommand ?? meta.startCommand;
    meta.resolvedStartCommand = first?.startCommand;
    meta.jobId = first?.jobId;
    meta.pid = first?.pid ?? null;
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

/** Stop or destroy all session project runtimes. */
export async function stopRegisteredSessionServices(options: {
  sessionId: number;
  cwd: string;
  services: SessionServicesMeta | null | undefined;
  jobs?: SessionServiceJobHost;
  mode?: "stop" | "destroy" | "uninstall";
}): Promise<void> {
  if (!hasRegisteredServices(options.services)) return;
  const services = options.services;
  const portEnv = appsToPortEnv(services.apps);
  const env: NodeJS.ProcessEnv = { ...process.env, ...portEnv };
  const mode = options.mode ?? "stop";
  const destroy = services.destroyCommand?.trim() ?? services.uninstallCommand?.trim();
  const command =
    mode === "uninstall" || mode === "destroy"
      ? destroy
      : (services.stopCommand?.trim() ?? destroy);

  if (command) {
    const resolved = substitutePortPlaceholders(command, portEnv);
    sessionLog(options.sessionId, "info", `Running ${mode}: ${resolved}`, ["system", "services"]);
    let jobId: string | undefined;
    if (options.jobs) {
      const job = await options.jobs.create(options.sessionId, {
        kind: "project-service",
        name: `${mode}:main`,
        label: `${mode} · project`,
        status: "running",
        executionMode: "inline",
        capabilities: ["read_output"],
        metadata: { command, resolvedCommand: resolved },
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

  for (const app of services.apps ?? []) {
    await stopRegisteredApp({ sessionId: options.sessionId, app, jobs: options.jobs });
  }

  const key = childKeyByName(options.sessionId, MAIN_SERVICE_NAME);
  const child = runningChildren.get(key);
  const pid = child?.pid ?? services.pid ?? null;
  if (pid) {
    sessionLog(options.sessionId, "info", `Killing service pid=${pid}`, ["system", "services"]);
    await killProcessTree(pid);
  }
  runningChildren.delete(key);
  if (services.jobId && options.jobs) {
    const stillBound = (services.apps ?? []).some((app) => app.jobId === services.jobId);
    if (!stillBound) {
      const job = await options.jobs.get(services.jobId);
      if (job && (job.status === "running" || job.status === "waiting")) {
        if (typeof options.jobs.cancel === "function") {
          await options.jobs.cancel(services.jobId).catch(() => undefined);
        } else {
          await options.jobs.update(services.jobId, { status: "cancelled" });
        }
      }
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

/** @deprecated no-op compatibility export */
export function flattenUiPorts(_entries: RegisteredServiceEntry[]): never[] {
  return [];
}

export function parseRegisteredServiceEntries(
  _services: SessionServicesMeta | null | undefined,
): RegisteredServiceEntry[] {
  return [];
}

export type { RunningServiceKey, ChildProcess };
