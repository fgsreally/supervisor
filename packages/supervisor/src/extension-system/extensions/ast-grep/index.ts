import { defineExtension } from "../../define-extension.js";
import { registerAgentTool } from "../../register-agent-tool.js";

export default defineExtension({
  name: "supervisor-ast-grep",
  async setup(ctx) {
    try {
      const { createAstGrepTool } = await import("./tool.js");
      registerAgentTool(ctx, createAstGrepTool(ctx.project.cwd));
    } catch (error: unknown) {
      ctx.runtime.log("warn", "ast_grep extension skipped", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});
