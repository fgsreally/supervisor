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
  findProjectBinDir,
  inferProjectInstallCommand,
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
  parseSessionServicesMeta,
  stoppedSessionServicesMeta,
} from "../../../core/session-services.js";
import type { SessionServiceJobHost } from "../../../core/session-registered-services.js";
import {
  findFreePortInRange,
  isLoopbackTcpPortOpen,
  SESSION_SERVICE_PREFERRED_PORT_MAX,
  SESSION_SERVICE_PREFERRED_PORT_MIN,
} from "../../../utils/ports.js";
import { detectListenPort } from "../../../utils/listen-port.js";

const UPDATE_TOOL = "UpdateService";
const UPDATE_DESCRIPTION =
  "增删改本 Session 的本地服务。必须带 action：add 新起一个进程并登记；delete 关掉对应进程并移除；update 关掉旧进程再按新命令启动。先检查 Session worktree 及其上级目录能否直接复用项目依赖；例如 Node/npm 项目能向上找到可用的 node_modules/.bin 时，不要传 installCommand，工具会跳过安装并直接启动。只有无法从当前目录或上级目录取得依赖时，才传入与项目包管理器匹配的 installCommand。startCommand 必须调用当前项目自身声明的启动脚本，不要直接调用可能从 Supervisor PATH 解析出的裸二进制；必须让服务监听 127.0.0.1 或 0.0.0.0。命令用 ${PORT1}、${PORT2} 等连续编号占位符声明所需端口；调用完成后工具会为每个占位符分配并持久化空闲端口。不要写死端口，也不要用 bash 直接启动长期服务。";
const UPDATE_PARAMS = Type.Object({
  action: Type.Union([Type.Literal("add"), Type.Literal("delete"), Type.Literal("update")], {
    description: "add 新增 / delete 删除 / update 修改",
  }),
  name: Type.String({ description: "服务名，如 web、api" }),
  startCommand: Type.Optional(
    Type.String({
      description:
        "启动命令；add / update 必填。使用当前项目自身声明的启动脚本，并让服务监听 127.0.0.1 或 0.0.0.0；不要直接调用可能从 Supervisor PATH 解析出的裸二进制。端口使用 ${PORT1}、${PORT2} 等连续编号占位符，工具会在调用后分配空闲端口并替换",
    }),
  ),
  port: Type.Optional(
    Type.Number({
      description: "已弃用；端口由工具根据 startCommand 中的 ${PORT1}、${PORT2} 等占位符自动分配",
    }),
  ),
  path: Type.Optional(Type.String({ description: "URL 路径，默认 /" })),
  installCommand: Type.Optional(
    Type.String({
      description:
        "可选的依赖安装命令。先检查 Session worktree 及其上级目录；若能直接复用依赖（例如 Node/npm 项目能向上找到可用的 node_modules/.bin），不要传此参数，工具会跳过安装并直接启动。仅在无法取得依赖时传入与锁文件和包管理器匹配的命令",
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

    const allocateCommandPorts = async (
      startCommand: string,
      occupied: Iterable<number>,
    ): Promise<Record<string, number> | null> => {
      const names = validateNumberedPortPlaceholders(startCommand);
      if (!names) return null;
      const used = new Set(occupied);
      const allocated: Record<string, number> = {};
      for (const name of names) {
        const port = await findFreePortInRange(
          SESSION_SERVICE_PREFERRED_PORT_MIN,
          SESSION_SERVICE_PREFERRED_PORT_MAX,
          used,
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

    const waitForDetectedPort = async (
      jobId: string,
    ): Promise<{ port?: number; output: string; exited: boolean }> => {
      const started = Date.now();
      let output = "";
      while (Date.now() - started < APPLY_READY_MS) {
        const job = await ctx.jobs.get(jobId);
        output = typeof job?.output === "string" ? job.output : "";
        const port = detectListenPort(output);
        if (port) return { port, output, exited: false };
        if (job && job.status !== "running" && job.status !== "waiting") {
          return { output, exited: true };
        }
        await sleep(300);
      }
      return { output, exited: false };
    };

    const waitForAppReady = async (
      appName: string,
      started: SessionServiceApp,
    ): Promise<SessionServiceApp> => {
      if (!started.jobId) return started;

      let ready = started;
      const waited = await waitForDetectedPort(started.jobId);
      if (waited.exited) {
        throw new Error(
          `Service ${appName} exited before it became ready. Output:\n${waited.output.slice(-4000) || "(no output)"}`,
        );
      }
      if (waited.port) {
        const declaredOpen = await isLoopbackTcpPortOpen(started.port);
        const detectedOpen = await isLoopbackTcpPortOpen(waited.port);
        if (detectedOpen && (!declaredOpen || started.port !== waited.port)) {
          ready = { ...started, port: waited.port };
        }
      }
      if (!(await isLoopbackTcpPortOpen(ready.port))) {
        await stopRegisteredApp({ sessionId, app: started, jobs });
        throw new Error(
          `Service ${appName} reported a port, but Supervisor could not connect to 127.0.0.1:${ready.port}. The service was stopped; check its listen address.`,
        );
      }
      return ready;
    };

    const waitForAppsReady = async (started: SessionServicesMeta): Promise<SessionServicesMeta> => {
      const readyApps: SessionServiceApp[] = [];
      try {
        for (const app of started.apps ?? []) {
          readyApps.push(await waitForAppReady(app.name, app));
        }
      } catch (error) {
        await Promise.all(
          (started.apps ?? []).map((app) =>
            stopRegisteredApp({ sessionId, app, jobs }).catch(() => undefined),
          ),
        );
        throw error;
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
      const installCommand =
        params.installCommand?.trim() ||
        current.installCommand ||
        (findProjectBinDir(cwd()) ? undefined : inferProjectInstallCommand(cwd()));

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
        });
        let ready = started;
        if (started.jobId) {
          const waited = await waitForDetectedPort(started.jobId);
          if (waited.exited) {
            throw new Error(
              `服务 ${name} 在就绪前退出。输出：\n${waited.output.slice(-4000) || "(no output)"}`,
            );
          }
          if (waited.port) {
            const declaredOpen = await isLoopbackTcpPortOpen(started.port);
            const detectedOpen = await isLoopbackTcpPortOpen(waited.port);
            if (detectedOpen && (!declaredOpen || started.port !== waited.port)) {
              ready = { ...started, port: waited.port };
            }
          }
          if (!(await isLoopbackTcpPortOpen(ready.port))) {
            await stopRegisteredApp({ sessionId, app: started, jobs });
            throw new Error(
              `服务 ${name} 已输出端口信息，但 Supervisor 无法连接 127.0.0.1:${ready.port}；已停止该服务。请检查启动命令的监听地址。`,
            );
          }
        }
        return ready;
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
      try {
        await ctx.watson.run({
          mode: "agent",
          kind: "session-services-register",
          toolsPreset: "readonly",
          extraTools: [watsonUpdateTool],
          injectSystem:
            "分析当前项目是否有需要启动的本地开发服务。有启动命令则必须调用 UpdateService，action=add；每个服务调用一次。未指定 port 时不要猜 3000/5173，省略 port，系统会在 4396–4500 分配。不要用 bash 启动长期服务；不要改 AGENTS.md。",
          prompt: [
            "本 Session 刚创建。请分析项目中需要长期运行的本地开发服务。",
            "若项目根目录存在 AGENTS.md 且包含「本地开发服务」，优先采用其中的命令；AGENTS.md 或该章节不存在时，继续检查 package.json、workspace 配置、README、构建工具和项目结构，不得因此跳过分析。",
            "若有启动命令：对每个要跑的服务调用 UpdateService，action=add，传入 name、startCommand 和可选 path；是否需要 installCommand 按工具描述判断。",
            "不要填写 port，除非命令里写死了端口；未指定时系统使用 4396–4500。",
            "没有启动命令则不要调用工具，直接结束。",
            "不要 commit，不要改 AGENTS.md。",
          ].join("\n"),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.log("warn", `Session service register skipped: ${message}`);
      }
    }

    ctx.agent.registerTool({
      name: "ProjectServiceStart",
      description:
        "按已登记命令后台启动项目服务。仅当配置未变、服务已停时使用。增删改请用 UpdateService。",
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
        "停止本 session 已登记的项目服务（系统托管进程）。用户要求停止或重启时用这个，不要 taskkill。",
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
