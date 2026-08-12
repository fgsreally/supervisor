import { Type } from "typebox";
import { resolve as resolvePath } from "node:path";
import type { ExtensionContext, ExtensionDefinition, ExtensionJobFacade } from "../../types.js";
import type { SessionServiceApp, SessionServicesMeta } from "../../../core/project-runtime.js";
import {
  hasRegisteredServices,
  isSessionServiceProcessAlive,
  startRegisteredSessionServices,
  stopRegisteredSessionServices,
} from "../../../core/session-registered-services.js";
import {
  SESSION_SERVICE_SLEEP_MS,
  SESSION_SERVICE_SLEEP_TICK_MS,
  computeServiceSleepAt,
} from "../../../core/session-service-sleep.js";
import {
  parseSessionServicesMeta,
  stoppedSessionServicesMeta,
} from "../../../core/session-services.js";
import type { SessionServiceJobHost } from "../../../core/session-registered-services.js";
import { anyTcpPortOpen, isTcpPortOpen } from "../../../utils/ports.js";
import { detectListenPort } from "../../../utils/listen-port.js";

const SETUP_TOOL = "ProjectServiceSetup";

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
      return { id: job.id, status: job.status, metadata: job.metadata };
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

function parseAppsParam(
  raw: Array<{ name: string; port: number; path?: string }> | undefined,
): SessionServiceApp[] {
  if (!raw?.length) return [];
  return raw
    .map((item) => ({
      name: item.name.trim(),
      port: item.port,
      path: item.path?.trim() || "/",
    }))
    .filter((item) => item.name && Number.isFinite(item.port) && item.port > 0);
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
  name: "project-services",
  async setup(ctx) {
    const agentRow = ctx.db.queryOne<{ tools_preset: string }>(
      `SELECT a.tools_preset FROM agents a
       JOIN sessions s ON s.agent_id = a.id WHERE s.id = ?`,
      [ctx.session.id],
    );
    if (agentRow?.tools_preset !== "coding") {
      return () => {};
    }

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
      const ports = (current!.apps ?? []).map((app) => app.port).filter((p) => p > 0);
      const portsOpen = ports.length > 0 ? await anyTcpPortOpen(ports) : false;

      if (isServiceActive(current!.status)) {
        if (isSessionServiceProcessAlive(sessionId, current) || portsOpen) {
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

      // Already serving via bash/adopted job: just mark active, do not spawn a second process.
      if (portsOpen || isSessionServiceProcessAlive(sessionId, current)) {
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
        });
        await writeServices(next);
      }
    };

    ensureGlobalSleepScheduler(ctx);

    ctx.on("session.create", async () => {
      // Clear legacy hardcoded inject; workflow lives in coding prompt + tool results.
      await ctx.session.upsertSystemPromptBlock("project-services", "");
    });

    ctx.on("session.start", async () => {
      await reconcileBoundJob();
      const current = await readServices();
      if (!current) return;
      const lastActive = current.lastActiveAt ?? Date.now();
      if (isServiceActive(current.status) && Date.now() - lastActive >= SESSION_SERVICE_SLEEP_MS) {
        await writeServices({
          ...current,
          status: "idle",
          pid: null,
          jobId: undefined,
          resolvedStartCommand: undefined,
        });
      }
    });

    ctx.on("message.user", async () => {
      await wakeServices();
    });

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

    const runTeardown = async (mode: "stop" | "uninstall") => {
      const current = await readServices();
      if (!hasRegisteredServices(current)) return;
      if (mode === "stop") {
        await stopRegisteredSessionServices({
          sessionId,
          cwd: cwd(),
          services: current,
          jobs,
          mode: "stop",
        });
        return;
      }
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
    };

    ctx.on("session.before_complete", async () => runTeardown("stop"), {
      priority: 300,
      mode: "sync",
    });
    ctx.on("session.before_complete", async () => runTeardown("uninstall"), {
      priority: 200,
      mode: "sync",
    });
    ctx.on("session.before_delete", async () => runTeardown("stop"), {
      priority: 300,
      mode: "sync",
    });
    ctx.on("session.before_delete", async () => runTeardown("uninstall"), {
      priority: 200,
      mode: "sync",
    });

    ctx.agent.registerTool({
      name: SETUP_TOOL,
      description:
        "登记 install/start/stop/destroy 与 apps[{ name, port, path }]。已有后台 bash 时传 taskId；port 用 bash 返回的 detectedPort（会按 Job 输出校正）。成功即活跃应用，勿再 Start。",
      parameters: Type.Object({
        installCommand: Type.Optional(Type.String()),
        startCommand: Type.String({ description: "启动命令（长期运行）" }),
        stopCommand: Type.Optional(Type.String({ description: "关闭命令（闲置时）" })),
        destroyCommand: Type.Optional(Type.String({ description: "销毁/卸载命令（归档删除时）" })),
        taskId: Type.Optional(
          Type.String({
            description: "已在跑的后台 bash task_id；传入则直接标为活跃应用，不再 Start。",
          }),
        ),
        apps: Type.Array(
          Type.Object({
            name: Type.String({ description: "入口名，如 web" }),
            port: Type.Number({ description: "实际监听端口" }),
            path: Type.Optional(Type.String({ description: "URL 路径，默认 /" })),
          }),
          { description: "可预览的应用入口" },
        ),
      }),
      execute: async (params) => {
        const current = (await readServices()) ?? {
          status: "unregistered" as const,
          startCommand: "",
        };
        let apps = parseAppsParam(params.apps);
        const taskId = params.taskId?.trim() || undefined;
        let jobId = taskId;
        let pid: number | null = null;
        let status: SessionServicesMeta["status"] = "unregistered";
        let jobOutput = "";

        if (taskId) {
          const job = await jobs.get(taskId);
          if (job && (job.status === "running" || job.status === "waiting")) {
            const jobCwd = typeof job.metadata?.cwd === "string" ? job.metadata.cwd.trim() : "";
            if (jobCwd && !isJobCwdInSession(jobCwd, ctx.session.cwd)) {
              return {
                content: [
                  {
                    type: "text",
                    text: [
                      `拒绝绑定 taskId=${taskId}：该 Job 的 cwd（${jobCwd}）不在本 Session 工作目录（${ctx.session.cwd}）内。`,
                      "请在 Session cwd 下重新 bash 启动服务后再 Setup。",
                    ].join(""),
                  },
                ],
              };
            }
            const metaPid = job.metadata?.pid;
            pid = typeof metaPid === "number" ? metaPid : null;
            status = "active";
            jobId = job.id;
            const full = await ctx.jobs.get(taskId);
            jobOutput = typeof full?.output === "string" ? full.output : "";
          }
        }

        // Prefer the real listen port from server output (Vite may bump 5173 → 5174).
        const detectedPort = detectListenPort(jobOutput);
        if (detectedPort && apps.length > 0) {
          const declaredOpen = await anyTcpPortOpen(apps.map((app) => app.port));
          const detectedOpen = await isTcpPortOpen(detectedPort);
          if (detectedOpen && (!declaredOpen || apps.every((app) => app.port !== detectedPort))) {
            apps = apps.map((app, index) => (index === 0 ? { ...app, port: detectedPort } : app));
          }
        }

        const portsOpen =
          apps.length > 0 ? await anyTcpPortOpen(apps.map((app) => app.port)) : false;
        if (status !== "active" && portsOpen) {
          status = "active";
        }
        // Bound running job counts as active even if declared ports were wrong.
        if (status !== "active" && jobId && pid != null) {
          status = "active";
        }

        if (!apps.length) {
          return {
            content: [
              {
                type: "text",
                text: "Setup 需要至少一个 apps[{ name, port, path }] 入口。",
              },
            ],
          };
        }

        const now = Date.now();
        const next: SessionServicesMeta = {
          ...current,
          installCommand: params.installCommand?.trim() || undefined,
          startCommand: params.startCommand.trim(),
          stopCommand: params.stopCommand?.trim() || undefined,
          destroyCommand: params.destroyCommand?.trim() || undefined,
          apps,
          status,
          pid: status === "active" ? pid : null,
          jobId: status === "active" ? jobId : undefined,
          resolvedStartCommand: undefined,
          ...(status === "active"
            ? {
                lastActiveAt: now,
                sleepAt: computeServiceSleepAt(now),
                startedAt: new Date().toISOString(),
                installedAt: current.installedAt ?? new Date().toISOString(),
              }
            : {}),
        };
        await writeServices(next);
        const appsSummary = apps
          .map((app) => `${app.name}:${app.port}${app.path ?? "/"}`)
          .join(", ");
        return {
          content: [
            {
              type: "text",
              text:
                status === "active"
                  ? `已登记并激活应用（${apps.length}）：${appsSummary}${jobId ? `；job=${jobId}` : ""}${detectedPort ? `；detectedPort=${detectedPort}` : ""}。勿再 ProjectServiceStart。`
                  : `已登记项目服务（${apps.length} 个入口：${appsSummary}），但尚未确认在跑（端口未通且无有效 taskId）。可 ProjectServiceStart，或修正 apps.port 后重试 Setup。`,
            },
          ],
        };
      },
    });

    ctx.agent.registerTool({
      name: "ProjectServiceStart",
      description:
        "按已登记命令后台启动项目服务。仅当服务未在跑时使用。若 Setup 已带 taskId/端口已通，不要调用。重启先 ProjectServiceStop。",
      parameters: Type.Object({
        skipInstall: Type.Optional(Type.Boolean()),
      }),
      execute: async (params) => {
        const current = await readServices();
        if (!hasRegisteredServices(current)) {
          return {
            content: [{ type: "text", text: "尚未登记服务，请先调用 ProjectServiceSetup。" }],
          };
        }
        const ports = (current!.apps ?? []).map((app) => app.port).filter((p) => p > 0);
        const portsOpen = ports.length > 0 ? await anyTcpPortOpen(ports) : false;
        if (
          (isServiceActive(current!.status) && isSessionServiceProcessAlive(sessionId, current)) ||
          portsOpen
        ) {
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
        });
        await writeServices(next);
        return {
          content: [
            {
              type: "text",
              text: `服务已启动。入口：${JSON.stringify(next.apps ?? [])}`,
            },
          ],
        };
      },
    });

    ctx.agent.registerTool({
      name: "ProjectServiceStop",
      description:
        "停止本 session 已登记的项目服务（系统托管进程）。用户要求停止或重启时用这个，不要 taskkill。",
      parameters: Type.Object({}),
      execute: async () => {
        const current = await readServices();
        if (!hasRegisteredServices(current)) {
          return {
            content: [{ type: "text", text: "尚未登记服务，请先调用 ProjectServiceSetup。" }],
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
      description: "列出已登记的项目服务及运行状态。",
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
