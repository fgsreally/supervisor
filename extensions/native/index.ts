import { defineAgentExtension } from "pi-supervisor";
import { registerFsCacheInvalidation } from "./hooks/fs-cache.js";
import { isPiNativesAvailable } from "./pi-natives-loader.js";
import { registerNativeTool } from "./register-tool.js";
import { createNativeAstGrepTool } from "./tools/ast-grep.js";
import { createNativeBashTool } from "./tools/bash.js";
import { createNativeFindTool } from "./tools/find.js";
import { createNativeGrepTool } from "./tools/grep.js";
import { createNativeLsTool } from "./tools/ls.js";
import { createNativeReadTool } from "./tools/read.js";
import { createNativeWebFetchTool } from "./tools/web-fetch.js";

export default defineAgentExtension({
  name: "supervisor-native",
  scope: "agent",
  async setup(ctx) {
    if (!isPiNativesAvailable()) {
      ctx.log("warn", "native extension skipped: pi-natives platform addon unavailable");
      return;
    }

    ctx.agent.on("session.setup", (session) => {
      const tools = [
        createNativeBashTool(session.cwd),
        createNativeGrepTool(session.cwd),
        createNativeFindTool(session.cwd),
        createNativeLsTool(session.cwd),
        createNativeReadTool(session.cwd),
        createNativeAstGrepTool(session.cwd),
        createNativeWebFetchTool(),
      ];

      for (const tool of tools) registerNativeTool(ctx, tool);
      registerFsCacheInvalidation(session);
    });

    ctx.log(
      "info",
      "native: registered Rust-backed bash, grep, find, ls, read, ast_grep, web_fetch",
    );
  },
});
