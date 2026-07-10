import { defineExtension } from "../../define-extension.js";
import { registerAgentTool } from "../../register-agent-tool.js";
import { createBrowserTool } from "./tool.js";

export default defineExtension({
  name: "supervisor-browser",
  async setup(ctx) {
    try {
      const { tool, cleanup } = createBrowserTool();
      registerAgentTool(ctx, tool);
      return cleanup;
    } catch (error: unknown) {
      ctx.runtime.log("warn", "browser extension skipped", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});
