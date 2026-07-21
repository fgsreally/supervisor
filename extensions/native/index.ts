import { defineExtension } from "pi-supervisor";
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

export default defineExtension({
  name: "supervisor-native",
  async setup(ctx) {
    if (!isPiNativesAvailable()) {
      ctx.runtime.log("warn", "native extension skipped: pi-natives platform addon unavailable");
      return;
    }

    const cwd = ctx.project.cwd;
    const tools = [
      createNativeBashTool(cwd),
      createNativeGrepTool(cwd),
      createNativeFindTool(cwd),
      createNativeLsTool(cwd),
      createNativeReadTool(cwd),
      createNativeAstGrepTool(cwd),
      createNativeWebFetchTool(),
    ];

    for (const tool of tools) {
      registerNativeTool(ctx, tool);
    }

    registerFsCacheInvalidation(ctx);

    ctx.runtime.log(
      "info",
      "native: registered Rust-backed bash, grep, find, ls, read, ast_grep, web_fetch",
    );
  },
});
