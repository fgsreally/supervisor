import { defineExtension } from "../../define-extension.js";
import { registerAgentTool } from "../../register-agent-tool.js";
import { createOverrideLspTool } from "./tool.js";

export default defineExtension({
  name: "supervisor-lsp",
  setup(ctx) {
    registerAgentTool(ctx, createOverrideLspTool(ctx.project.cwd));
  },
});
