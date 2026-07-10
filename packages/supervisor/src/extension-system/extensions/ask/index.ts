import { defineExtension } from "../../define-extension.js";
import { registerAgentTool } from "../../register-agent-tool.js";
import { createAskTool } from "./tool.js";

export default defineExtension({
  name: "supervisor-ask",
  setup(ctx) {
    registerAgentTool(ctx, createAskTool(ctx.session.id), {
      pausing: true,
      pausingMessage: "ask tool waiting for user answer",
    });
  },
});
