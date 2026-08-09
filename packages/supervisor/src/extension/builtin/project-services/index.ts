import { Type } from "typebox";
import type {
  ExtensionContext,
  ExtensionDefinition,
  ExtensionJobFacade,
  ToolInfo,
} from "../../types.js";
import type { SessionServicesMeta } from "../../../core/project-runtime.js";
import {
  areRegisteredServicesAlive,
  startRegisteredSessionServices,
  stopRegisteredSessionServices,
  type RegisteredServiceEntry,
} from "../../../core/session-registered-services.js";
import {
  SESSION_SERVICE_SLEEP_MS,
  SESSION_SERVICE_SLEEP_TICK_MS,
  computeServiceSleepAt,
} from "../../../core/session-service-sleep.js";
import {
  flattenUiPorts,
  type SessionServiceJobHost,
} from "../../../core/session-registered-services.js";

const SETUP_TOOL = "ProjectServiceSetup";
const SERVICE_TOOL_NAMES = new Set([SETUP_TOOL, "ProjectServiceStart", "ProjectServiceList"]);

const FIRST_SESSION_PROMPT = [
  "项目服务（首会话必做）：",
  "1. 探查依赖并在需要时执行 install（bash/包管理器）。",
  "2. 调用 ProjectServiceSetup 登记：启动命令、端口占位符（如 ${PORT}）、关闭命令、卸载命令。",
  "3. 调用 ProjectServiceStart 启动 dev server；不要重复手动起长期服务。",
].join("\n");

const RUNNING_PROMPT = [
  "项目服务：",
  "- 继续对话前会自动尝试唤醒已注册服务；也可手动 ProjectServiceStart。",
  "- 关闭/卸载由系统在闲置或归档时执行，无需手动调用。",
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

function parseServices(meta: Record<string, unknown>): SessionServicesMeta | null {
  const raw = meta.services;
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
    status !== "active" &&
    status !== "stopped" &&
    status !== "idle" &&
    status !== "error" &&
    status !== "unregistered"
  ) {
    return null;
  }
  const entries: RegisteredServiceEntry[] = [];
  if (Array.isArray(row.entries)) {
    for (const item of row.entries) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      const startCommand = typeof entry.startCommand === "string" ? entry.startCommand.trim() : "";
      if (!name || !startCommand) continue;
      const uiPorts: RegisteredServiceEntry["uiPorts"] = [];
      if (Array.isArray(entry.uiPorts)) {
        for (const portItem of entry.uiPorts) {
          if (!portItem || typeof portItem !== "object") continue;
          const port = portItem as Record<string, unknown>;
          const envVar = typeof port.envVar === "string" ? port.envVar.trim() : "";
          if (!envVar) continue;
          uiPorts.push({
            envVar,
            label: typeof port.label === "string" ? port.label : undefined,
            path: typeof port.path === "string" ? port.path : undefined,
          });
        }
      }
      entries.push({
        name,
        startCommand,
        installCommand: typeof entry.installCommand === "string" ? entry.installCommand : undefined,
        stopCommand: typeof entry.stopCommand === "string" ? entry.stopCommand : undefined,
        destroyCommand: typeof entry.destroyCommand === "string" ? entry.destroyCommand : undefined,
        uninstallCommand:
          typeof entry.uninstallCommand === "string" ? entry.uninstallCommand : undefined,
        uiPorts: uiPorts.length > 0 ? uiPorts : undefined,
      });
    }
  }
  return {
    entries: entries.length > 0 ? entries : undefined,
    portEnv,
    status,
    sleepAt: typeof row.sleepAt === "number" ? row.sleepAt : undefined,
    installedAt: typeof row.installedAt === "string" ? row.installedAt : undefined,
    lastActiveAt: typeof row.lastActiveAt === "number" ? row.lastActiveAt : undefined,
    uiPorts: entries.length > 0 ? flattenUiPorts(entries) : undefined,
  };
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
      const meta = parseServices(JSON.parse(row.meta || "{}"));
      if (!meta?.entries?.length || !isServiceActive(meta.status)) continue;
      const sleepAt = meta.sleepAt;
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
            portEnv: {},
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
      return parseServices(meta);
    };

    const writeServices = async (services: SessionServicesMeta): Promise<void> => {
      await ctx.session.meta.patch({ services });
    };

    const refreshInject = async (services: SessionServicesMeta | null) => {
      const unregistered = !services?.entries?.length || services.status === "unregistered";
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
      if (!current?.entries?.length) return;
      const now = Date.now();

      if (isServiceActive(current.status)) {
        const alive = areRegisteredServicesAlive(current.entries, current.portEnv ?? {});
        if (alive) {
          await writeServices({
            ...current,
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

      if (isServiceIdle(current.status) || isServiceActive(current.status)) {
        const next = await startRegisteredSessionServices({
          sessionId,
          cwd: cwd(),
          services: current,
          jobs,
          skipInstall: !!current.installedAt,
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
        await writeServices({ ...current, status: "idle", portEnv: {} });
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
        if (!current?.entries?.length) return;
        await stopRegisteredSessionServices({
          sessionId,
          cwd: cwd(),
          services: current,
          jobs,
          mode: "stop",
        });
        await writeServices({ ...current, status: "idle", portEnv: {} });
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
      if (!current?.entries?.length) return;
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
      await writeServices({ ...current, status: "idle", portEnv: {} });
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
        "登记本 session 的项目服务：install/start/stop/uninstall 命令与 UI 端口（${PORT} 等占位符）。首会话注册后此工具会隐藏。",
      parameters: Type.Object({
        name: Type.String({ description: "服务名称，如 web" }),
        installCommand: Type.Optional(Type.String()),
        startCommand: Type.String({ description: "启动命令（长期运行）" }),
        stopCommand: Type.Optional(Type.String({ description: "关闭命令（闲置时）" })),
        uninstallCommand: Type.Optional(Type.String({ description: "卸载命令（归档/删除时）" })),
        uiPorts: Type.Optional(
          Type.Array(
            Type.Object({
              envVar: Type.String(),
              label: Type.Optional(Type.String()),
              path: Type.Optional(Type.String()),
            }),
          ),
        ),
      }),
      execute: async (params) => {
        const meta = await ctx.session.meta.get();
        const current =
          parseServices(meta) ??
          ({
            status: "unregistered",
            portEnv: {},
            entries: [],
          } satisfies SessionServicesMeta);

        const entry: RegisteredServiceEntry = {
          name: params.name.trim(),
          startCommand: params.startCommand.trim(),
          installCommand: params.installCommand?.trim() || undefined,
          stopCommand: params.stopCommand?.trim() || undefined,
          uninstallCommand: params.uninstallCommand?.trim() || undefined,
          uiPorts: params.uiPorts?.map((port) => ({
            envVar: port.envVar.trim(),
            label: port.label?.trim(),
            path: port.path?.trim(),
          })),
        };

        const entries = [
          ...(current.entries ?? []).filter((item) => item.name !== entry.name),
          entry,
        ];
        const next: SessionServicesMeta = {
          ...current,
          entries,
          uiPorts: flattenUiPorts(entries),
          status: "unregistered",
          portEnv: current.portEnv ?? {},
        };
        await writeServices(next);
        await refreshInject(next);
        return {
          content: [
            {
              type: "text",
              text: `已登记服务「${entry.name}」。请先完成 install（如需要），再调用 ProjectServiceStart 启动。`,
            },
          ],
        };
      },
    });

    ctx.agent.registerTool({
      name: "ProjectServiceStart",
      description: "启动已登记的项目服务（分配端口并后台运行）。",
      parameters: Type.Object({
        skipInstall: Type.Optional(Type.Boolean()),
      }),
      execute: async (params) => {
        const current = await readServices();
        if (!current?.entries?.length) {
          return {
            content: [{ type: "text", text: "尚未登记服务，请先调用 ProjectServiceSetup。" }],
          };
        }
        if (
          isServiceActive(current.status) &&
          areRegisteredServicesAlive(current.entries, current.portEnv)
        ) {
          return {
            content: [
              {
                type: "text",
                text: `服务已在运行。端口：${JSON.stringify(current.portEnv)}`,
              },
            ],
          };
        }
        const next = await startRegisteredSessionServices({
          sessionId,
          cwd: cwd(),
          services: current,
          jobs,
          skipInstall: params.skipInstall ?? !!current.installedAt,
          lastActiveAtMs: Date.now(),
        });
        await writeServices(next);
        return {
          content: [
            {
              type: "text",
              text: `服务已启动。端口：${JSON.stringify(next.portEnv)}`,
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
