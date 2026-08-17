import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { resolve as resolvePath } from "node:path";
import type { ExtensionContext, ExtensionDefinition, ExtensionJobFacade } from "../../types.js";
import {
  extractPortPlaceholders,
  type SessionServiceApp,
  type SessionServicesMeta,
} from "../../../core/project-runtime.js";
import {
  hasRegisteredServices,
  isSessionServiceProcessAlive,
  startRegisteredApp,
  startRegisteredSessionServices,
  stopRegisteredApp,
  stopRegisteredSessionServices,
} from "../../../core/session-registered-services.js";
import {
  SESSION_SERVICE_SLEEP_MS,
  SESSION_SERVICE_SLEEP_TICK_MS,
  computeServiceSleepAt,
} from "../../../core/session-service-sleep.js";
import {
  collectReservedServicePorts,
  parseSessionServicesMeta,
  stoppedSessionServicesMeta,
} from "../../../core/session-services.js";
import type { SessionServiceJobHost } from "../../../core/session-registered-services.js";
import {
  findFreePortInRange,
  isLoopbackTcpPortOpen,
  preferredServicePortHint,
  SESSION_SERVICE_PREFERRED_PORT_MAX,
  SESSION_SERVICE_PREFERRED_PORT_MIN,
} from "../../../utils/ports.js";
import { detectListenPort } from "../../../utils/listen-port.js";

const UPDATE_TOOL = "UpdateService";
const UPDATE_DESCRIPTION =
  "Add, delete, or update local services for this Session. The action is required: add starts and registers a process; delete stops and removes one; update stops the old process and starts the new command. Decide yourself whether the project needs an installCommand (any language or package manager); the tool only runs the command you provide and does not infer one. startCommand must invoke a start script declared by the project, not a bare binary resolved from Supervisor PATH; the service must listen on 127.0.0.1 or 0.0.0.0. Declare ports with consecutive placeholders such as ${PORT1} and ${PORT2}; the tool allocates and persists free ports after the call. Never hard-code ports or start a long-running service directly with bash.";
const UPDATE_PARAMS = Type.Object({
  action: Type.Union([Type.Literal("add"), Type.Literal("delete"), Type.Literal("update")], {
    description: "add a service / delete a service / update a service",
  }),
  name: Type.String({ description: "Service name, such as web or api" }),
  startCommand: Type.Optional(
    Type.String({
      description:
        "Start command; required for add/update. Use a start script declared by the project and listen on 127.0.0.1 or 0.0.0.0; do not invoke a bare binary resolved from Supervisor PATH. Declare ports with consecutive placeholders such as ${PORT1} and ${PORT2}; the tool allocates and replaces them after the call.",
    }),
  ),
  port: Type.Optional(
    Type.Number({
      description:
        "Deprecated; the tool allocates ports from ${PORT1}, ${PORT2}, and similar placeholders in startCommand.",
    }),
  ),
  path: Type.Optional(Type.String({ description: "URL path, default /" })),
  installCommand: Type.Optional(
    Type.String({
      description:
        "Optional dependency installation command. Provide it only when you decide a fresh install is needed; omit it to start without installing. The tool does not infer a package manager.",
    }),
  ),
  stopCommand: Type.Optional(Type.String()),
  destroyCommand: Type.Optional(Type.String()),
});
const APPLY_READY_MS = 90_000;

function numberedPortPlaceholders(command: string): string[] {
  return [
    ...new Set(extractPortPlaceholders(command).filter((name) => /^PORT[1-9]\d*$/.test(name))),
  ].sort((left, right) => Number(left.slice(4)) - Number(right.slice(4)));
}

export function validateNumberedPortPlaceholders(command: string): string[] | null {
  const names = numberedPortPlaceholders(command);
  if (names.length === 0) return null;
  return names.every((name, index) => name === `PORT${index + 1}`) ? names : null;
}

function applyText(text: string): {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
} {
  return { content: [{ type: "text" as const, text }], details: null };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when jobCwd is the session cwd or a path inside it. */
function isJobCwdInSession(jobCwd: string, sessionCwd: string): boolean {
  const session = resolvePath(sessionCwd);
  const job = resolvePath(jobCwd);
  if (process.platform === "win32") {
    const a = session.toLowerCase();
    const b = job.toLowerCase();
    return b === a || b.startsWith(a.endsWith("\\") ? a : `${a}\\`);
  }
  return job === session || job.startsWith(session.endsWith("/") ? session : `${session}/`);
}

function extensionJobsAsHost(jobs: ExtensionJobFacade): SessionServiceJobHost {
  return {
    create(_sessionId, input) {
      return jobs.create(input);
    },
    async update(id, patch) {
      await jobs.update(id, patch);
    },
    async get(id) {
      const job = await jobs.get(id);
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

function isServiceActive(status: SessionServicesMeta["status"] | undefined): boolean {
  return status === "active" || status === "running" || status === "starting";
}

function isServiceIdle(status: SessionServicesMeta["status"] | undefined): boolean {
  return (
    status === "idle" || status === "stopped" || status === "unregistered" || status === "error"
  );
}

function finalizeServices(
  current: SessionServicesMeta,
  apps: SessionServiceApp[],
): SessionServicesMeta {
  const first = apps[0];
  const running = apps.some((app) => Boolean(app.jobId) || (app.pid != null && app.pid > 0));
  const now = Date.now();
  return {
    ...current,
    apps,
    startCommand: first?.startCommand ?? current.startCommand ?? "",
    jobId: first?.jobId,
    pid: first?.pid ?? null,
    resolvedStartCommand: first?.startCommand,
    status: apps.length === 0 ? "unregistered" : running ? "active" : "idle",
    lastActiveAt: now,
    sleepAt: computeServiceSleepAt(now),
    error: undefined,
  };
}

let globalSleepSchedulerStarted = false;

function ensureGlobalSleepScheduler(ctx: ExtensionContext): void {
  if (globalSleepSchedulerStarted) return;
  globalSleepSchedulerStarted = true;
  const tick = async () => {
    const rows = ctx.db.query<{ id: number; meta: string; cwd: string; last_active_at: number }>(
      `SELECT id, meta, cwd, last_active_at FROM sessions
       WHERE status NOT IN ('finish', 'finished')`,
      [],
    );
    const now = Date.now();
    for (const row of rows) {
      const meta = parseSessionServicesMeta(JSON.parse(row.meta || "{}"));
      if (!hasRegisteredServices(meta) || !isServiceActive(meta?.status)) continue;
      const sleepAt = meta!.sleepAt;
      if (!sleepAt || sleepAt > now) continue;
      try {
        await stopRegisteredSessionServices({
          sessionId: row.id,
          cwd: row.cwd,
          services: meta,
          mode: "stop",
        });
        const merged = {
          ...JSON.parse(row.meta || "{}"),
          services: {
            ...meta,
            status: "idle" as const,
            pid: null,
            jobId: undefined,
            resolvedStartCommand: undefined,
          },
        };
        ctx.db.execute("UPDATE sessions SET meta = ? WHERE id = ?", [
          JSON.stringify(merged),
          row.id,
        ]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.log("warn", `Service sleep failed [${row.id}]: ${message}`);
      }
    }
  };
  void tick();
  setInterval(() => void tick(), SESSION_SERVICE_SLEEP_TICK_MS).unref?.();
}

const projectServicesExtension: ExtensionDefinition = {
  name: "service",
  async setup(ctx) {
    const bash = ctx.capabilities.get<{
      run: (
        command: string,
        options?: { cwd?: string; label?: string; env?: NodeJS.ProcessEnv },
      ) => Promise<{ id: string; pid?: number }>;
    }>("persistent-bash");
    if (!bash) {
      ctx.log("warn", "service requires persistent-bash");
      return () => {};
    }
    const runBackground = (input: {
      command: string;
      cwd: string;
      label: string;
      env?: NodeJS.ProcessEnv;
    }) =>
      bash.run(input.command, {
        cwd: input.cwd,
        label: input.label,
        env: input.env,
      });

    const jobs = extensionJobsAsHost(ctx.jobs);
    const sessionId = ctx.session.id;
    const cwd = () => ctx.session.cwd;

    const readServices = async (): Promise<SessionServicesMeta | null> => {
      const meta = await ctx.session.meta.get();
      return parseSessionServicesMeta(meta);
    };

    const writeServices = async (services: SessionServicesMeta): Promise<void> => {
      await ctx.session.meta.patch({ services });
    };

    const allocateCommandPorts = async (
      startCommand: string,
      occupied: Iterable<number>,
    ): Promise<Record<string, number> | null> => {
      const names = validateNumberedPortPlaceholders(startCommand);
      if (!names) return null;
      const reserved = collectReservedServicePorts(
        ctx.db.query<{ id: number; meta: string }>("SELECT id, meta FROM sessions", []),
        sessionId,
      );
      const used = new Set([...occupied, ...reserved]);
      const allocated: Record<string, number> = {};
      const startAt = preferredServicePortHint(sessionId);
      for (const name of names) {
        const port = await findFreePortInRange(
          SESSION_SERVICE_PREFERRED_PORT_MIN,
          SESSION_SERVICE_PREFERRED_PORT_MAX,
          used,
          startAt,
        );
        if (!port) return null;
        allocated[name] = port;
        used.add(port);
      }
      return allocated;
    };

    /** Drop meta.services.jobId when the Job is gone or its cwd is outside this Session. */
    const reconcileBoundJob = async (): Promise<void> => {
      const current = await readServices();
      if (!current?.jobId) return;
      const job = await jobs.get(current.jobId);
      const alive = job && (job.status === "running" || job.status === "waiting");
      const jobCwd = typeof job?.metadata?.cwd === "string" ? job.metadata.cwd.trim() : "";
      const cwdOk = !jobCwd || isJobCwdInSession(jobCwd, cwd());
      if (alive && cwdOk) return;
      await writeServices(stoppedSessionServicesMeta(current));
      if (alive && jobCwd && !cwdOk) {
        ctx.log(
          "warn",
          `Cleared services.jobId=${current.jobId}: cwd ${jobCwd} outside session ${cwd()}`,
        );
      }
    };

    const wakeServices = async (): Promise<void> => {
      const current = await readServices();
      if (!hasRegisteredServices(current)) return;
      const now = Date.now();

      if (isServiceActive(current!.status)) {
        if (isSessionServiceProcessAlive(sessionId, current)) {
          await writeServices({
            ...current!,
            status: "active",
            lastActiveAt: now,
            sleepAt: computeServiceSleepAt(now),
          });
          return;
        }
        await stopRegisteredSessionServices({
          sessionId,
          cwd: cwd(),
          services: current,
          jobs,
          mode: "stop",
        });
      }

      // Only processes owned by this Session may make a registered service active.
      // An open port alone may belong to an orphan or an unrelated application.
      if (isSessionServiceProcessAlive(sessionId, current)) {
        await writeServices({
          ...current!,
          status: "active",
          lastActiveAt: now,
          sleepAt: computeServiceSleepAt(now),
        });
        return;
      }

      if (isServiceIdle(current!.status) || isServiceActive(current!.status)) {
        const next = await startRegisteredSessionServices({
          sessionId,
          cwd: cwd(),
          services: current!,
          jobs,
          skipInstall: !!current!.installedAt,
          lastActiveAtMs: now,
          runBackground,
        });
        await writeServices(await waitForAppsReady(next));
      }
    };

    ensureGlobalSleepScheduler(ctx);

    await reconcileBoundJob();
    const setupServices = await readServices();
    if (setupServices) {
      const lastActive = setupServices.lastActiveAt ?? Date.now();
      if (
        isServiceActive(setupServices.status) &&
        Date.now() - lastActive >= SESSION_SERVICE_SLEEP_MS
      ) {
        await writeServices({
          ...setupServices,
          status: "idle",
          pid: null,
          jobId: undefined,
          resolvedStartCommand: undefined,
        });
      }
    }

    ctx.on("message.user", async () => wakeServices(), { mode: "async" });

    ctx.on("session.services_wake", async () => {
      await wakeServices();
    });

    ctx.on(
      "session.before_sync",
      async () => {
        const current = await readServices();
        if (!hasRegisteredServices(current)) return;
        await stopRegisteredSessionServices({
          sessionId,
          cwd: cwd(),
          services: current,
          jobs,
          mode: "stop",
        });
        await writeServices({
          ...current!,
          status: "idle",
          pid: null,
          jobId: undefined,
          resolvedStartCommand: undefined,
        });
      },
      { priority: 300, mode: "sync" },
    );

    ctx.on(
      "session.after_sync",
      async () => {
        await wakeServices();
      },
      { priority: 200, mode: "sync" },
    );

    ctx.on(
      "session.before_complete",
      async () => {
        const current = await readServices();
        if (!hasRegisteredServices(current)) return;
        await stopRegisteredSessionServices({
          sessionId,
          cwd: cwd(),
          services: current,
          jobs,
          mode: "stop",
        });
      },
      { priority: 300, mode: "sync" },
    );
    ctx.on(
      "session.before_complete",
      async () => {
        const current = await readServices();
        if (!hasRegisteredServices(current)) return;
        await stopRegisteredSessionServices({
          sessionId,
          cwd: cwd(),
          services: current,
          jobs,
          mode: "uninstall",
        });
        await writeServices({
          ...current!,
          status: "idle",
          pid: null,
          jobId: undefined,
          resolvedStartCommand: undefined,
        });
      },
      { priority: 200, mode: "sync" },
    );

    const waitForAppReady = async (
      appName: string,
      started: SessionServiceApp,
    ): Promise<SessionServiceApp> => {
      if (!started.jobId) return started;

      const deadline = Date.now() + APPLY_READY_MS;
      let output = "";
      while (Date.now() < deadline) {
        const job = await ctx.jobs.get(started.jobId);
        output = typeof job?.output === "string" ? job.output : "";
        const detected = detectListenPort(output);
        const candidates = [started.port, detected].filter(
          (port): port is number => typeof port === "number" && Number.isInteger(port) && port > 0,
        );
        for (const port of candidates) {
          if (await isLoopbackTcpPortOpen(port)) {
            return port === started.port ? started : { ...started, port };
          }
        }
        // Windows pnpm/npx .cmd often exits while Vite stays up as a grandchild.
        // Never treat the wrapper job ending as "service dead", and never kill it.
        if (/Missing script|command not found|ENOENT/i.test(output)) {
          throw new Error(`Service ${appName} failed to start. Output:\n${output.slice(-4000)}`);
        }
        await sleep(300);
      }
      throw new Error(
        `Service ${appName} did not become reachable on 127.0.0.1:${started.port}. Output:\n${output.slice(-4000) || "(no output)"}`,
      );
    };

    const waitForAppsReady = async (started: SessionServicesMeta): Promise<SessionServicesMeta> => {
      const readyApps: SessionServiceApp[] = [];
      for (const app of started.apps ?? []) {
        readyApps.push(await waitForAppReady(app.name, app));
      }
      const first = readyApps.find((app) => app.jobId) ?? readyApps[0];
      return {
        ...started,
        apps: readyApps,
        jobId: first?.jobId,
        pid: first?.pid ?? null,
      };
    };

    const updateService = async (
      params: Static<typeof UPDATE_PARAMS>,
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: unknown;
    }> => {
      const name = params.name.trim();
      if (!name) return applyText("需要 name。");
      const action = params.action;
      const current = (await readServices()) ?? {
        status: "unregistered" as const,
        startCommand: "",
      };
      const apps = [...(current.apps ?? [])];
      const existing = apps.find((app) => app.name === name);
      const installCommand = params.installCommand?.trim() || current.installCommand;

      const patchCommands = (base: SessionServicesMeta): SessionServicesMeta => ({
        ...base,
        installCommand: installCommand || base.installCommand,
        stopCommand: params.stopCommand?.trim() || base.stopCommand,
        destroyCommand: params.destroyCommand?.trim() || base.destroyCommand,
      });

      const startAndRegister = async (app: SessionServiceApp, list: SessionServiceApp[]) => {
        let next: SessionServicesMeta = patchCommands({
          ...current,
          apps: list,
          startCommand: current.startCommand || app.startCommand || "",
          status: "starting",
        });
        const started = await startRegisteredApp({
          sessionId,
          cwd: cwd(),
          services: next,
          app,
          jobs,
          runBackground,
        });
        return waitForAppReady(name, started);
      };

      try {
        if (action === "add") {
          if (existing) return applyText(`服务 ${name} 已存在，请用 action=update。`);
          const startCommand = params.startCommand?.trim();
          if (!startCommand) return applyText("add 需要 startCommand。");
          const portEnv = await allocateCommandPorts(
            startCommand,
            apps.flatMap((app) => [app.port, ...Object.values(app.portEnv ?? {})]),
          );
          if (!portEnv) {
            return applyText(
              `startCommand 必须按顺序使用 \${PORT1}、\${PORT2} 等占位符，且 ${SESSION_SERVICE_PREFERRED_PORT_MIN}–${SESSION_SERVICE_PREFERRED_PORT_MAX} 需要有足够的空闲端口。未启动服务。`,
            );
          }
          const port = portEnv.PORT1!;
          const app: SessionServiceApp = {
            name,
            port,
            portEnv,
            path: params.path?.trim() || "/",
            startCommand,
          };
          const nextList = [...apps, app];
          if (!current.installedAt && installCommand) {
            const pending = patchCommands({
              ...current,
              apps: nextList,
              startCommand: current.startCommand || startCommand,
              status: "starting",
              installCommand,
            });
            const startedAll = await startRegisteredSessionServices({
              sessionId,
              cwd: cwd(),
              services: pending,
              jobs,
              skipInstall: false,
              lastActiveAtMs: Date.now(),
              runBackground,
            });
            const readyServices = await waitForAppsReady(startedAll);
            await writeServices(readyServices);
            const summary = (readyServices.apps ?? [])
              .map((item) => `${item.name}:${item.port}`)
              .join(", ");
            return applyText(
              `已新增 ${name}。端口：${Object.entries(portEnv)
                .map(([key, value]) => `${key}=${value}`)
                .join(", ")}。当前服务：${summary || name}`,
            );
          }
          const started = await startAndRegister(app, nextList);
          const nextListReady = nextList.map((item) => (item.name === name ? started : item));
          await writeServices(finalizeServices(patchCommands(current), nextListReady));
          return applyText(
            `已新增 ${name}。端口：${Object.entries(portEnv)
              .map(([key, value]) => `${key}=${value}`)
              .join(", ")}。`,
          );
        }

        if (action === "delete") {
          if (!existing) return applyText(`没有名为 ${name} 的服务。`);
          await stopRegisteredApp({ sessionId, app: existing, jobs });
          const nextList = apps.filter((app) => app.name !== name);
          await writeServices(finalizeServices(current, nextList));
          return applyText(`已删除 ${name}。`);
        }

        if (!existing) return applyText(`没有名为 ${name} 的服务，请用 action=add。`);
        const startCommand = params.startCommand?.trim() || existing.startCommand;
        if (!startCommand) return applyText("update 需要 startCommand。");
        const otherApps = apps.filter((app) => app.name !== name);
        const portEnv = await allocateCommandPorts(
          startCommand,
          otherApps.flatMap((app) => [app.port, ...Object.values(app.portEnv ?? {})]),
        );
        if (!portEnv) {
          return applyText(
            `startCommand 必须按顺序使用 \${PORT1}、\${PORT2} 等占位符，且 ${SESSION_SERVICE_PREFERRED_PORT_MIN}–${SESSION_SERVICE_PREFERRED_PORT_MAX} 需要有足够的空闲端口。原服务保持不变。`,
          );
        }
        const port = portEnv.PORT1!;
        const path = params.path?.trim() || existing.path || "/";
        await stopRegisteredApp({ sessionId, app: existing, jobs });
        const updated: SessionServiceApp = { name, port, portEnv, path, startCommand };
        const nextList = apps.map((app) => (app.name === name ? updated : app));
        if (!current.installedAt && installCommand) {
          const pending = patchCommands({
            ...current,
            apps: nextList,
            startCommand,
            status: "starting",
            installCommand,
          });
          const startedAll = await startRegisteredSessionServices({
            sessionId,
            cwd: cwd(),
            services: pending,
            jobs,
            skipInstall: false,
            lastActiveAtMs: Date.now(),
            runBackground,
          });
          const readyServices = await waitForAppsReady(startedAll);
          await writeServices(readyServices);
          return applyText(
            `已安装依赖并更新 ${name}。端口：${Object.entries(portEnv)
              .map(([key, value]) => `${key}=${value}`)
              .join(", ")}。`,
          );
        }
        const started = await startAndRegister(updated, nextList);
        const nextListReady = nextList.map((item) => (item.name === name ? started : item));
        await writeServices(finalizeServices(patchCommands(current), nextListReady));
        return applyText(
          `已更新 ${name}。端口：${Object.entries(portEnv)
            .map(([key, value]) => `${key}=${value}`)
            .join(", ")}。`,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        await writeServices({ ...current, status: "error", error: message });
        return applyText(`UpdateService 失败：${message}`);
      }
    };

    ctx.agent.registerTool({
      name: UPDATE_TOOL,
      description: UPDATE_DESCRIPTION,
      parameters: UPDATE_PARAMS,
      execute: updateService,
    });

    const watsonUpdateTool: AgentTool<typeof UPDATE_PARAMS> = {
      name: UPDATE_TOOL,
      label: UPDATE_TOOL,
      description: UPDATE_DESCRIPTION,
      parameters: UPDATE_PARAMS,
      execute: async (_toolCallId, params) => updateService(params),
    };

    if (!hasRegisteredServices(await readServices())) {
      void ctx.watson
        .run({
          mode: "agent",
          kind: "session-services-register",
          toolsPreset: "readonly",
          extraTools: [watsonUpdateTool],
          injectSystem:
            "Analyze whether the current project has local development services that should start. If a start command exists, call UpdateService with action=add once per service. Do not guess 3000/5173 when no port is specified; omit port and the system will allocate one in 4396–4500. Do not start long-running services with bash or modify AGENTS.md.",
          prompt: [
            "This Session was just created. Analyze the project's long-running local development services.",
            "If the project root has AGENTS.md with `## 本地开发服务`, prefer its commands. If AGENTS.md or that section is absent, continue by checking package.json, workspace configuration, README, build tools, and project structure; do not skip analysis.",
            "For each service with a start command, call UpdateService with action=add and provide name, startCommand, and optional path. Inspect the project yourself and decide whether installCommand is needed; do not assume a Node package manager.",
            "Do not provide port unless the command hard-codes one; otherwise the system uses 4396–4500.",
            "If there is no start command, do not call the tool and finish.",
            "Do not commit or modify AGENTS.md.",
          ].join("\n"),
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          ctx.log("warn", `Session service register skipped: ${message}`);
        });
    }

    ctx.agent.registerTool({
      name: "ProjectServiceStart",
      description:
        "Start the registered project services in the background. Use only when the configuration is unchanged and the service is stopped. Use UpdateService for add/delete/update operations.",
      parameters: Type.Object({
        skipInstall: Type.Optional(Type.Boolean()),
      }),
      execute: async (params) => {
        const current = await readServices();
        if (!hasRegisteredServices(current)) {
          return {
            content: [
              { type: "text", text: "尚未登记服务，请先调用 UpdateService（action=add）。" },
            ],
          };
        }
        if (isServiceActive(current!.status) && isSessionServiceProcessAlive(sessionId, current)) {
          const now = Date.now();
          await writeServices({
            ...current!,
            status: "active",
            lastActiveAt: now,
            sleepAt: computeServiceSleepAt(now),
          });
          return {
            content: [
              {
                type: "text",
                text: `服务已在运行，已标记活跃。入口：${JSON.stringify(current!.apps ?? [])}。勿重复拉起。`,
              },
            ],
          };
        }
        const next = await startRegisteredSessionServices({
          sessionId,
          cwd: cwd(),
          services: current!,
          jobs,
          skipInstall: params.skipInstall ?? !!current!.installedAt,
          lastActiveAtMs: Date.now(),
          runBackground,
        });
        const ready = await waitForAppsReady(next);
        await writeServices(ready);
        return {
          content: [
            {
              type: "text",
              text: `服务已启动。入口：${JSON.stringify(ready.apps ?? [])}`,
            },
          ],
        };
      },
    });

    ctx.agent.registerTool({
      name: "ProjectServiceStop",
      description:
        "Stop the project services registered for this Session (system-managed processes). Use this when the user asks to stop or restart them; do not use taskkill.",
      parameters: Type.Object({}),
      execute: async () => {
        const current = await readServices();
        if (!hasRegisteredServices(current)) {
          return {
            content: [
              { type: "text", text: "尚未登记服务，请先调用 UpdateService（action=add）。" },
            ],
          };
        }
        await stopRegisteredSessionServices({
          sessionId,
          cwd: cwd(),
          services: current,
          jobs,
          mode: "stop",
        });
        const next: SessionServicesMeta = {
          ...current!,
          status: "idle",
          pid: null,
          jobId: undefined,
          resolvedStartCommand: undefined,
        };
        await writeServices(next);
        return {
          content: [
            {
              type: "text",
              text: `服务已停止。入口：${JSON.stringify(next.apps ?? [])}。需要再启动时调用 ProjectServiceStart。`,
            },
          ],
        };
      },
    });

    ctx.agent.registerTool({
      name: "ProjectServiceList",
      description: "List registered project services and their runtime status.",
      parameters: Type.Object({}),
      execute: async () => {
        const current = await readServices();
        return {
          content: [{ type: "text", text: JSON.stringify(current ?? { status: "none" }, null, 2) }],
        };
      },
    });

    return () => {};
  },
};

export default projectServicesExtension;
