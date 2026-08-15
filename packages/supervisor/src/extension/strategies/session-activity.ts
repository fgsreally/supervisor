import type { ExtensionDefinition } from "../types.js";

/** Default hidden Session activity policy. */
export const sessionActivityStrategy: ExtensionDefinition = {
  name: "session-activity",
  setup(ctx) {
    const touch = () => {
      if (!ctx.policies?.isDisabled?.("session-activity")) ctx.session.activity?.touch?.();
    };
    const off = [
      ctx.on("message.user", touch, { priority: 1000 }),
      ctx.on("message.assistant", touch, { priority: 1000 }),
      ctx.on("message.tool_call", touch, { priority: 1000 }),
      ctx.on("message.tool_result", touch, { priority: 1000 }),
      ctx.on("message.custom", touch, { priority: 1000 }),
    ];
    return () => off.forEach((cleanup) => cleanup());
  },
};
