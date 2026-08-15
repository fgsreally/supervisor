import type { AgentExtensionDefinition } from "../types.js";

/** Default hidden Session activity policy. */
export const sessionActivityPolicy: AgentExtensionDefinition = {
  name: "session-activity",
  scope: "agent",
  setup(ctx) {
    ctx.agent.on("session.setup", (session) => {
      const touch = () => session.activity.touch();
      session.on("message.user", touch, { priority: 1000 });
      session.on("message.assistant", touch, { priority: 1000 });
      session.on("message.tool_call", touch, { priority: 1000 });
      session.on("message.tool_result", touch, { priority: 1000 });
      session.on("message.custom", touch, { priority: 1000 });
    });
  },
};
