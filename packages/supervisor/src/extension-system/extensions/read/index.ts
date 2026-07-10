import { defineExtension } from "../../define-extension.js";
import { registerAgentTool } from "../../register-agent-tool.js";
import { createOverrideReadTool } from "./tool.js";

export default defineExtension({
  name: "supervisor-read",
  setup(ctx) {
    registerAgentTool(ctx, createOverrideReadTool(ctx.project.cwd));
  },
});
