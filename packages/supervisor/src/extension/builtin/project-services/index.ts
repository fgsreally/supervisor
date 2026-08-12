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
  computeServiceSleepAt,
} from "../../../core/session-service-sleep.js";
import {
  buildSessionServicesPrompt,
  parseSessionServicesMeta,
  stoppedSessionServicesMeta,
} from "../../../core/session-services.js";
import type { SessionServiceJobHost } from "../../../core/session-registered-services.js";
import { anyTcpPortOpen, findFreePort, isTcpPortOpen } from "../../../utils/ports.js";
import { detectListenPort } from "../../../utils/listen-port.js";
import { inferProjectRootFromCwd } from "../../../core/agent-permissions.js";
import {
  buildProjectServicePreparationPrompt,
  preparationToServices,
  ProjectServicePreparationSchema,
} from "./preparation.js";

const SETUP_TOOL = "ProjectServiceSetup";
const PREPARED_META_KEY = "project-services.prepared";
const pendingSessionPorts = new Set<number>();
const DISALLOWED_SESSION_PORTS = new Set([3000, 5173]);

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

/**
 * Allow binding a bash Job whose cwd is the session worktree, the project root,
 * or any ancestor that contains the session cwd (common with git worktrees).
 */
function isJobBoundableToSession(jobCwd: string, sessionCwd: string): boolean {
  const job = jobCwd.trim();
  if (!job) return true;
  if (isJobCwdInSession(job, sessionCwd)) return true;
  // Session worktree under the Job's project cwd.
  if (isJobCwdInSession(sessionCwd, job)) return true;
  const projectRoot = inferProjectRootFromCwd(sessionCwd);
  if (projectRoot && isJobCwdInSession(job, projectRoot)) return true;
  return false;
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

function reservedServicePorts(ctx: ExtensionContext, sessionId: number): Set<number> {
  const reserved = new Set(pendingSessionPorts);
  for (const row of ctx.db.query<{ id: number; meta: string }>("SELECT id, meta FROM sessions")) {
    if (row.id === sessionId) continue;
    try {
      const services = parseSessionServicesMeta(JSON.parse(row.meta || "{}"));
      for (const app of services?.apps ?? []) reserved.add(app.port);
    } catch {
      // Ignore malformed legacy metadata while looking for a free port.
    }
  }
  return reserved;
}

async function allocateSessionPort(ctx: ExtensionContext, sessionId: number): Promise<number> {
  const reserved = reservedServicePorts(ctx, sessionId);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const port = await findFreePort();
    if (reserved.has(port) || DISALLOWED_SESSION_PORTS.has(port)) continue;
    pendingSessionPorts.add(port);
    return port;
  }
  throw new Error("无法为 Session 分配独占端口");
}

async function waitForServicePort(apps: SessionServiceApp[], timeoutMs = 30_000): Promise<boolean> {
  if (apps.length === 0) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await anyTcpPortOpen(apps.map((app) => app.port))) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

const projectServicesExtension: ExtensionDefinition = {
  name: "project-services",
  async setup(ctx) {
    // Lightweight extension fixtures and third-party hosts may omit raw SQL.
    // Project service orchestration needs the Session/Agent rows to scope itself.
    if (!ctx.db.available) return () => {};
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
      await ctx.session.upsertSystemPromptBlock(
        "project-services",
        buildSessionServicesPrompt(services),
      );
    };

    /** Drop meta.services.jobId when the Job is gone or its cwd is outside this Session. */
    const reconcileBoundJob = async (): Promise<void> => {
      const current = await readServices();
      if (!current?.jobId) return;
      const job = await jobs.get(current.jobId);
      const alive = job && (job.status === "running" || job.status === "waiting");
      const jobCwd = typeof job?.metadata?.cwd === "string" ? job.metadata.cwd.trim() : "";
      const cwdOk = !jobCwd || isJobBoundableToSession(jobCwd, cwd());
      if (alive && cwdOk) return;
      await writeServices(stoppedSessionServicesMeta(current));
      if (alive && jobCwd && !cwdOk) {
        ctx.log(
          "warn",
          `Cleared services.jobId=${current.jobId}: cwd ${jobCwd} not boundable to session ${cwd()}`,
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

    ctx.on(
      "session.create",
      async () => {
        const existing = await readServices();
        if (hasRegisteredServices(existing)) {
          await ctx.session.upsertSystemPromptBlock(
            "project-services",
            buildSessionServicesPrompt(existing),
          );
          return;
        }
        const sessionMeta = await ctx.session.meta.get();
        if (sessionMeta[PREPARED_META_KEY] === true) {
          await ctx.session.upsertSystemPromptBlock("project-services", "");
          return;
        }

        let port: number | undefined;
        try {
          port = await allocateSessionPort(ctx, sessionId);
          ctx.log("info", `Watson is preparing project services on reserved port ${port}`);
          const run = await ctx.watson.run({
            kind: "session-project-service-prepare",
            mode: "agent",
            cwd: cwd(),
            toolsPreset: "readonly",
            resultSchema: ProjectServicePreparationSchema,
            prompt: buildProjectServicePreparationPrompt(port),
            injectSystem:
              "你只负责只读探查并提交结构化服务配置。不要修改项目，不要执行安装或启动命令。",
          });
          if (!run.result) throw new Error("华生未提交项目服务配置");
          const services = preparationToServices(run.result, port);
          if (!services) {
            await ctx.session.meta.patch({ [PREPARED_META_KEY]: true });
            await ctx.session.upsertSystemPromptBlock("project-services", "");
            ctx.log("info", "Watson found no long-running project service");
            return;
          }

          await writeServices(services);
          await ctx.session.meta.patch({ [PREPARED_META_KEY]: true });
          const started = await startRegisteredSessionServices({
            sessionId,
            cwd: cwd(),
            services,
            jobs,
            lastActiveAtMs: Date.now(),
          });
          if (!(await waitForServicePort(started.apps ?? []))) {
            await stopRegisteredSessionServices({
              sessionId,
              cwd: cwd(),
              services: started,
              jobs,
              mode: "stop",
            });
            const failed: SessionServicesMeta = {
              ...started,
              status: "error",
              pid: null,
              jobId: undefined,
              resolvedStartCommand: undefined,
              error: "启动命令已执行，但预留端口在 30 秒内未开始监听",
            };
            await writeServices(failed);
            throw new Error(failed.error);
          }
          await writeServices(started);
          ctx.log(
            "info",
            `Project service prepared and started: ${started.resolvedStartCommand ?? started.startCommand}`,
          );
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          const registered = await readServices();
          if (hasRegisteredServices(registered) && !isServiceActive(registered.status)) {
            await writeServices({
              ...registered,
              status: "error",
              pid: null,
              jobId: undefined,
              resolvedStartCommand: undefined,
              sleepAt: undefined,
              error: message,
            });
          }
          ctx.log("warn", `Automatic project service preparation failed: ${message}`);
        } finally {
          if (port !== undefined) pendingSessionPorts.delete(port);
        }
      },
      // Worktree preparation uses the default priority. Run after it so the service
      // belongs to the Session worktree rather than the project's checked-out branch.
      { priority: -100, mode: "sync" },
    );

    ctx.on("session.start", async () => {
      await reconcileBoundJob();
      let current = await readServices();
      if (!current) return;
      const lastActive = current.lastActiveAt ?? Date.now();
      if (isServiceActive(current.status) && Date.now() - lastActive >= SESSION_SERVICE_SLEEP_MS) {
        await stopRegisteredSessionServices({
          sessionId,
          cwd: cwd(),
          services: current,
          jobs,
          mode: "stop",
        });
        await writeServices(stoppedSessionServicesMeta(current));
        current = await readServices();
      }
      if (current) {
        await ctx.session.upsertSystemPromptBlock(
          "project-services",
          buildSessionServicesPrompt(current),
        );
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
        if (!isServiceActive(current.status) && !current.pid && !current.jobId) return;
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
        sleepAt: undefined,
        error: undefined,
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
            if (jobCwd && !isJobBoundableToSession(jobCwd, ctx.session.cwd)) {
              return {
                content: [
                  {
                    type: "text",
                    text: [
                      `拒绝绑定 taskId=${taskId}：该 Job 的 cwd（${jobCwd}）与本 Session 工作目录（${ctx.session.cwd}）不在同一项目下。`,
                      "请在 Session / 项目目录下重新 bash 启动服务后再注册应用。",
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
        // Vite may still be binding when Setup runs right after bash — retry once.
        if (status !== "active" && apps.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (await anyTcpPortOpen(apps.map((app) => app.port))) {
            status = "active";
          }
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
          sleepAt: undefined,
          error: undefined,
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
