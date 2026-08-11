import { Type } from "typebox";
import type {
  ExtensionContext,
  ExtensionDefinition,
  ExtensionJobFacade,
  ToolInfo,
} from "../../types.js";
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
import { parseSessionServicesMeta } from "../../../core/session-services.js";
import type { SessionServiceJobHost } from "../../../core/session-registered-services.js";

const SETUP_TOOL = "ProjectServiceSetup";
const SERVICE_TOOL_NAMES = new Set([SETUP_TOOL, "ProjectServiceStart", "ProjectServiceList"]);

const FIRST_SESSION_PROMPT = [
  "项目服务（首会话必做）：",
  "1. 优先阅读项目根目录 AGENTS.md 的「本地开发服务」章节获取安装/启动/停止/销毁命令（不含入口 port/path）。",
  "2. 按需执行 install，把项目跑起来，由你确认实际入口 name/port/path。",
  "3. 调用 ProjectServiceSetup 一次性登记：命令来自 AGENTS.md；apps[{ name, port, path }] 填你确认的入口。",
  "4. 调用 ProjectServiceStart 启动（若尚未在跑）；不要重复手动起长期服务。",
].join("\n");

const RUNNING_PROMPT = [
  "项目服务：",
  "- 命令与入口已登记；继续对话前会自动尝试唤醒。",
  "- 也可手动 ProjectServiceStart；关闭/销毁由系统在闲置或归档时执行。",
].join("\n");

function extensionJobsAsHost(jobs: ExtensionJobFacade): SessionServiceJobHost {
  return {
    create(_sessionId, input) {
      return jobs.create(input);
    },
    async update(id, patch) {
      await jobs.update(id, patch);
    },
    async get(id) {
      return jobs.get(id);
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

async function applyVisibleServiceTools(ctx: ExtensionContext, showSetup: boolean): Promise<void> {
  const tools = ctx.agent.listTools();
  const names = tools
    .filter(
      (tool: ToolInfo) =>
        !SERVICE_TOOL_NAMES.has(tool.name) || (tool.name === SETUP_TOOL ? showSetup : true),
    )
    .map((tool) => tool.name);
  await ctx.session.tools.setActive(names);
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

    const refreshInject = async (services: SessionServicesMeta | null) => {
      const unregistered = !hasRegisteredServices(services) || services?.status === "unregistered";
      ctx.inject.clear("project-services");
      ctx.inject.schedule({
        variant: "project-services",
        content: unregistered ? FIRST_SESSION_PROMPT : RUNNING_PROMPT,
        priority: unregistered ? 60 : 40,
      });
      await applyVisibleServiceTools(ctx, unregistered);
    };

    const wakeServices = async (): Promise<void> => {
      const current = await readServices();
      if (!hasRegisteredServices(current)) return;
      const now = Date.now();

      if (isServiceActive(current!.status)) {
        if (isSessionServiceProcessAlive(sessionId, current)) {
          await writeServices({
            ...current!,
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

    await refreshInject(await readServices());
    ensureGlobalSleepScheduler(ctx);

    ctx.on("session.start", async () => {
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
      await refreshInject(await readServices());
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
        "登记本 session 的项目运行时：install/start/stop/destroy 命令（优先取自 AGENTS.md「本地开发服务」），以及你确认后的 apps[{ name, port, path }]。登记后此工具会隐藏。",
      parameters: Type.Object({
        installCommand: Type.Optional(Type.String()),
        startCommand: Type.String({ description: "启动命令（长期运行）" }),
        stopCommand: Type.Optional(Type.String({ description: "关闭命令（闲置时）" })),
        destroyCommand: Type.Optional(Type.String({ description: "销毁/卸载命令（归档删除时）" })),
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
        const apps = parseAppsParam(params.apps);
        const next: SessionServicesMeta = {
          ...current,
          installCommand: params.installCommand?.trim() || undefined,
          startCommand: params.startCommand.trim(),
          stopCommand: params.stopCommand?.trim() || undefined,
          destroyCommand: params.destroyCommand?.trim() || undefined,
          apps,
          status: "unregistered",
          pid: null,
          jobId: undefined,
          resolvedStartCommand: undefined,
        };
        await writeServices(next);
        await refreshInject(next);
        return {
          content: [
            {
              type: "text",
              text: `已登记项目服务（${apps.length} 个入口）。请先完成 install（如需要），再调用 ProjectServiceStart 启动。`,
            },
          ],
        };
      },
    });

    ctx.agent.registerTool({
      name: "ProjectServiceStart",
      description: "启动已登记的项目服务（后台运行）。",
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
        if (isServiceActive(current!.status) && isSessionServiceProcessAlive(sessionId, current)) {
          return {
            content: [
              {
                type: "text",
                text: `服务已在运行。入口：${JSON.stringify(current!.apps ?? [])}`,
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
