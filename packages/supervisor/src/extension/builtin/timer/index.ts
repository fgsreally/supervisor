import { Type } from "typebox";
import type { JobSchedule } from "../../../core/jobs.js";
import type { ExtensionDefinition } from "../../types.js";

const MAX_TIMERS = 50;
const MAX_DELAY_MS = 2_147_000_000;

interface LegacySessionTimer {
  prompt: string;
  nextFireAt: number;
  intervalMs?: number;
}

function parseLegacyTimers(value: unknown): LegacySessionTimer[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is LegacySessionTimer => {
    if (!item || typeof item !== "object") return false;
    const timer = item as Partial<LegacySessionTimer>;
    return (
      typeof timer.prompt === "string" &&
      timer.prompt.length > 0 &&
      typeof timer.nextFireAt === "number" &&
      Number.isFinite(timer.nextFireAt) &&
      (timer.intervalMs === undefined ||
        (typeof timer.intervalMs === "number" && timer.intervalMs > 0))
    );
  });
}

function timerResult(timer: JobSchedule) {
  return {
    id: timer.id,
    prompt: timer.prompt,
    createdAt: timer.createdAt,
    nextFireAt: timer.nextRunAt,
    ...(timer.intervalMs ? { intervalMs: timer.intervalMs } : {}),
  };
}

const timerExtension: ExtensionDefinition = {
  name: "timer",
  async setup(ctx) {
    const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

    const arm = (timer: JobSchedule) => {
      const previous = scheduled.get(timer.id);
      if (previous) clearTimeout(previous);
      const delay = Math.min(Math.max(0, timer.nextRunAt - Date.now()), MAX_DELAY_MS);
      const handle = setTimeout(() => {
        void fire(timer.id).catch((error) => {
          ctx.log("error", `Timer ${timer.id} failed`, {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }, delay);
      handle.unref?.();
      scheduled.set(timer.id, handle);
    };

    const fire = async (id: string) => {
      scheduled.delete(id);
      const timer = await ctx.jobs.schedules.get(id);
      if (!timer) return;
      if (timer.nextRunAt > Date.now()) {
        arm(timer);
        return;
      }

      if (timer.intervalMs) {
        let nextRunAt = timer.nextRunAt;
        while (nextRunAt <= Date.now()) nextRunAt += timer.intervalMs;
        arm(await ctx.jobs.schedules.update(timer.id, { nextRunAt }));
      } else {
        await ctx.jobs.schedules.delete(timer.id);
      }

      const firedAt = new Date().toISOString();
      const job = await ctx.jobs.create({
        kind: "timer",
        name: "timer.fire",
        label: timer.label,
        status: "running",
        executionMode: "background",
        metadata: { scheduleId: timer.id, firedAt },
      });
      try {
        await ctx.session.sendUserMessage(
          `<timer-fire id="${timer.id}" job-id="${job.id}" fired-at="${firedAt}">\n${timer.prompt}\n</timer-fire>`,
          { source: "timer", origin: timer.prompt },
        );
        await ctx.jobs.update(job.id, {
          status: "succeeded",
          result: { delivered: true },
          output: timer.prompt,
        });
      } catch (error) {
        await ctx.jobs.update(job.id, {
          status: "failed",
          error: { message: error instanceof Error ? error.message : String(error) },
        });
        throw error;
      }
    };

    let existingSchedules = await ctx.jobs.schedules.list();
    const meta = await ctx.session.meta.get();
    const legacyTimers = parseLegacyTimers(meta.timers);
    if (existingSchedules.length === 0 && legacyTimers.length > 0) {
      existingSchedules = await Promise.all(
        legacyTimers.map((timer) =>
          ctx.jobs.schedules.create({
            kind: "timer",
            name: "timer.fire",
            label: timer.prompt.split("\n")[0]!.slice(0, 120),
            prompt: timer.prompt,
            nextRunAt: timer.nextFireAt,
            ...(timer.intervalMs ? { intervalMs: timer.intervalMs } : {}),
            metadata: { migratedFrom: "session.meta.timers" },
          }),
        ),
      );
      await ctx.session.meta.patch({ timers: undefined });
    }
    for (const timer of existingSchedules) arm(timer);

    ctx.agent.registerTool({
      name: "TimerCreate",
      description:
        "Schedule a prompt to be injected into this Session later. Use either an ISO date-time or a delay in seconds. Optionally repeat at a fixed interval.",
      parameters: Type.Object({
        intent: Type.String({
          minLength: 1,
          description: "Short user-facing reason for scheduling this timer.",
        }),
        prompt: Type.String({ minLength: 1, maxLength: 8192 }),
        at: Type.Optional(Type.String({ description: "ISO 8601 date-time with timezone" })),
        delaySeconds: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
        repeatSeconds: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
      }),
      async execute(params: {
        prompt: string;
        intent: string;
        at?: string;
        delaySeconds?: number;
        repeatSeconds?: number;
      }) {
        if ((params.at === undefined) === (params.delaySeconds === undefined)) {
          throw new Error("Exactly one of at or delaySeconds is required");
        }
        const now = Date.now();
        const nextFireAt = params.at ? Date.parse(params.at) : now + params.delaySeconds! * 1000;
        if (!Number.isFinite(nextFireAt) || nextFireAt <= now) {
          throw new Error("Timer must be scheduled in the future");
        }
        const timers = await ctx.jobs.schedules.list();
        if (timers.length >= MAX_TIMERS) {
          throw new Error(`A Session can have at most ${MAX_TIMERS} timers`);
        }
        const timer = await ctx.jobs.schedules.create({
          kind: "timer",
          name: "timer.fire",
          label: params.intent,
          prompt: params.prompt,
          nextRunAt: nextFireAt,
          ...(params.repeatSeconds ? { intervalMs: params.repeatSeconds * 1000 } : {}),
          metadata: { intent: params.intent },
        });
        arm(timer);
        const result = timerResult(timer);
        return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
      },
    });

    ctx.agent.registerTool({
      name: "TimerList",
      description: "List the timers currently scheduled for this Session.",
      parameters: Type.Object({
        intent: Type.String({
          minLength: 1,
          description: "Short user-facing reason for checking scheduled timers.",
        }),
      }),
      async execute() {
        const timers = (await ctx.jobs.schedules.list()).map(timerResult);
        return { content: [{ type: "text", text: JSON.stringify(timers) }], details: { timers } };
      },
    });

    ctx.agent.registerTool({
      name: "TimerDelete",
      description: "Cancel a timer in this Session.",
      parameters: Type.Object({
        intent: Type.String({
          minLength: 1,
          description: "Short user-facing reason for cancelling this timer.",
        }),
        id: Type.String({ minLength: 1 }),
      }),
      async execute(params: { id: string; intent: string }) {
        if (!(await ctx.jobs.schedules.delete(params.id))) {
          throw new Error(`No timer with id ${params.id}`);
        }
        const handle = scheduled.get(params.id);
        if (handle) clearTimeout(handle);
        scheduled.delete(params.id);
        return { content: [{ type: "text", text: `Deleted timer ${params.id}` }] };
      },
    });

    return () => {
      for (const handle of scheduled.values()) clearTimeout(handle);
      scheduled.clear();
    };
  },
};

export default timerExtension;
