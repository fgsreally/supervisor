import { Type } from "typebox";
import type { ExtensionDefinition } from "../../types.js";
import {
  newSessionTimerId,
  parseSessionTimers,
  type SessionTimer,
} from "../../../core/session-timers.js";

const MAX_TIMERS = 50;
const MAX_DELAY_MS = 2_147_000_000;

function timerResult(timer: SessionTimer) {
  return {
    id: timer.id,
    prompt: timer.prompt,
    createdAt: timer.createdAt,
    nextFireAt: timer.nextFireAt,
    ...(timer.intervalMs ? { intervalMs: timer.intervalMs } : {}),
    ...(timer.label ? { label: timer.label } : {}),
  };
}

const timerExtension: ExtensionDefinition = {
  name: "timer",
  async setup(ctx) {
    const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

    const readTimers = async (): Promise<SessionTimer[]> => {
      const meta = await ctx.session.meta.get();
      return parseSessionTimers(meta);
    };

    const writeTimers = async (timers: SessionTimer[]): Promise<SessionTimer[]> => {
      const normalized = [...timers].sort((a, b) => a.nextFireAt - b.nextFireAt);
      await ctx.session.meta.patch({ timers: normalized });
      return normalized;
    };

    const getTimer = async (id: string): Promise<SessionTimer | undefined> =>
      (await readTimers()).find((timer) => timer.id === id);

    const upsertTimer = async (timer: SessionTimer): Promise<SessionTimer> => {
      const others = (await readTimers()).filter((item) => item.id !== timer.id);
      await writeTimers([...others, timer]);
      return timer;
    };

    const deleteTimer = async (id: string): Promise<boolean> => {
      const current = await readTimers();
      if (!current.some((timer) => timer.id === id)) return false;
      await writeTimers(current.filter((timer) => timer.id !== id));
      return true;
    };

    const arm = (timer: SessionTimer) => {
      const previous = scheduled.get(timer.id);
      if (previous) clearTimeout(previous);
      const delay = Math.min(Math.max(0, timer.nextFireAt - Date.now()), MAX_DELAY_MS);
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
      const timer = await getTimer(id);
      if (!timer) return;
      if (timer.nextFireAt > Date.now()) {
        arm(timer);
        return;
      }

      if (timer.intervalMs) {
        let nextFireAt = timer.nextFireAt;
        while (nextFireAt <= Date.now()) nextFireAt += timer.intervalMs;
        const updated = await upsertTimer({ ...timer, nextFireAt });
        arm(updated);
      } else {
        await deleteTimer(timer.id);
      }

      const firedAt = new Date().toISOString();
      const job = await ctx.jobs.create({
        kind: "timer",
        name: "timer.fire",
        label: timer.label ?? timer.prompt.split("\n")[0]!.slice(0, 120),
        status: "running",
        executionMode: "background",
        metadata: { timerId: timer.id, firedAt },
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

    for (const timer of await readTimers()) arm(timer);

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
        const timers = await readTimers();
        if (timers.length >= MAX_TIMERS) {
          throw new Error(`A Session can have at most ${MAX_TIMERS} timers`);
        }
        const timer: SessionTimer = {
          id: newSessionTimerId(),
          prompt: params.prompt,
          nextFireAt,
          createdAt: now,
          label: params.intent,
          ...(params.repeatSeconds ? { intervalMs: params.repeatSeconds * 1000 } : {}),
        };
        await upsertTimer(timer);
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
        const timers = (await readTimers()).map(timerResult);
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
        if (!(await deleteTimer(params.id))) {
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
