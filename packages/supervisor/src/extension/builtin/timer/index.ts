import { randomBytes } from "node:crypto";
import { Type } from "typebox";
import type { ExtensionDefinition } from "../../types.js";

export interface SessionTimer {
  id: string;
  prompt: string;
  createdAt: number;
  nextFireAt: number;
  intervalMs?: number;
}

const MAX_TIMERS = 50;
const MAX_DELAY_MS = 2_147_000_000;

export function parseSessionTimers(value: unknown): SessionTimer[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SessionTimer => {
    if (!item || typeof item !== "object") return false;
    const timer = item as Partial<SessionTimer>;
    return (
      typeof timer.id === "string" &&
      /^[0-9a-f]{8}$/.test(timer.id) &&
      typeof timer.prompt === "string" &&
      timer.prompt.length > 0 &&
      typeof timer.createdAt === "number" &&
      Number.isFinite(timer.createdAt) &&
      typeof timer.nextFireAt === "number" &&
      Number.isFinite(timer.nextFireAt) &&
      (timer.intervalMs === undefined ||
        (typeof timer.intervalMs === "number" && timer.intervalMs > 0))
    );
  });
}

const timerExtension: ExtensionDefinition = {
  name: "timer",
  async setup(ctx) {
    const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

    const persist = async (timers: SessionTimer[]) => {
      await ctx.session.meta.patch({ timers });
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
      const meta = await ctx.session.meta.get();
      const timers = parseSessionTimers(meta.timers);
      const timer = timers.find((item) => item.id === id);
      if (!timer) return;
      if (timer.nextFireAt > Date.now()) {
        arm(timer);
        return;
      }

      let next: SessionTimer | undefined;
      if (timer.intervalMs) {
        let nextFireAt = timer.nextFireAt;
        while (nextFireAt <= Date.now()) nextFireAt += timer.intervalMs;
        next = { ...timer, nextFireAt };
      }
      await persist(timers.flatMap((item) => (item.id === id ? (next ? [next] : []) : [item])));
      if (next) arm(next);

      const firedAt = new Date().toISOString();
      await ctx.session.sendUserMessage(
        `<timer-fire id="${timer.id}" fired-at="${firedAt}">\n${timer.prompt}\n</timer-fire>`,
        { source: "timer", origin: timer.prompt },
      );
    };

    const initialMeta = await ctx.session.meta.get();
    for (const timer of parseSessionTimers(initialMeta.timers)) arm(timer);

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
        const meta = await ctx.session.meta.get();
        const timers = parseSessionTimers(meta.timers);
        if (timers.length >= MAX_TIMERS) {
          throw new Error(`A Session can have at most ${MAX_TIMERS} timers`);
        }
        const timer: SessionTimer = {
          id: randomBytes(4).toString("hex"),
          prompt: params.prompt,
          createdAt: now,
          nextFireAt,
          ...(params.repeatSeconds ? { intervalMs: params.repeatSeconds * 1000 } : {}),
        };
        await persist([...timers, timer]);
        arm(timer);
        return { content: [{ type: "text", text: JSON.stringify(timer) }], details: timer };
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
        const meta = await ctx.session.meta.get();
        const timers = parseSessionTimers(meta.timers).toSorted(
          (left, right) => left.nextFireAt - right.nextFireAt,
        );
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
        id: Type.String({ pattern: "^[0-9a-f]{8}$" }),
      }),
      async execute(params: { id: string; intent: string }) {
        const meta = await ctx.session.meta.get();
        const timers = parseSessionTimers(meta.timers);
        if (!timers.some((timer) => timer.id === params.id)) {
          throw new Error(`No timer with id ${params.id}`);
        }
        await persist(timers.filter((timer) => timer.id !== params.id));
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
