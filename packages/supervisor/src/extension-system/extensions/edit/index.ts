import { defineExtension } from "../../define-extension.js";
import { registerAgentTool } from "../../register-agent-tool.js";
import { createOverrideEditTool } from "./tool.js";

export default defineExtension({
  name: "supervisor-edit",
  setup(ctx) {
    registerAgentTool(ctx, createOverrideEditTool(ctx.project.cwd));
  },
});
