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
    return () => {
      void stopBackgroundBashSessions(ctx.session.id, ctx.jobs).catch(() => undefined);
    };
  },
} satisfies ExtensionDefinition;
