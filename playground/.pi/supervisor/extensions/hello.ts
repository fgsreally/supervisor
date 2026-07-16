import { defineExtension } from "@earendil-works/pi-supervisor";

/** 最小 supervisor 扩展：加载时注册一条会话启动日志，无额外工具。 */
export default defineExtension({
  name: "hello",
  setup(ctx) {
    ctx.on("session.start", async () => {
      await ctx.appendEntry("hello-extension", { loaded: true, at: Date.now() });
    });
  },
});
