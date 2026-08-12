import type { ExtensionDefinition } from "../../types.js";
import { stopBackgroundBashSessions } from "../../../tools/bash/index.js";

/**
 * Session cleanup for background bash tasks.
 * The unified `bash` tool (fg + bg) lives in createDefaultTools / SessionManager —
 * this extension only stops leftover shell jobs when the session host unloads.
 */
export default {
  name: "persistent-bash",
  setup(ctx) {
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
