import type { ExtensionDefinition } from "../../types.js";
import {
  startBackgroundBashSession,
  stopBackgroundBashSessions,
} from "../../../tools/bash/index.js";

export type PersistentBashCapability = {
  run(
    command: string,
    options?: { cwd?: string; label?: string; env?: NodeJS.ProcessEnv },
  ): Promise<{ id: string; pid?: number }>;
};

/**
 * Background shell sessions for tools and other extensions (e.g. service).
 * Stops leftover jobs when the Session unloads.
 */
export default {
  name: "persistent-bash",
  setup(ctx) {
    ctx.capabilities.provide<PersistentBashCapability>("persistent-bash", {
      async run(command, options) {
        const session = await startBackgroundBashSession({
          sessionId: ctx.session.id,
          command,
          cwd: options?.cwd ?? ctx.session.cwd,
          label: options?.label ?? command,
          env: options?.env,
          jobs: ctx.jobs,
        });
        return { id: session.id, pid: session.pid };
      },
    });

    const stopAll = async () => {
      await stopBackgroundBashSessions(ctx.session.id, ctx.jobs);
    };
    ctx.on("session.before_complete", stopAll, { priority: 400, mode: "sync" });
    ctx.on("session.before_delete", stopAll, { priority: 400, mode: "sync" });
    return () => {
      void stopBackgroundBashSessions(ctx.session.id, ctx.jobs).catch(() => undefined);
    };
  },
} satisfies ExtensionDefinition;
