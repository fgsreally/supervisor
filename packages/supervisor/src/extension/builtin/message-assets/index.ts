import { isAbsolute, relative, sep } from "node:path";
import type { ExtensionDefinition, MessageAsset } from "../../types.js";

const messageAssetsExtension: ExtensionDefinition = {
  name: "message-assets",
  setup(ctx) {
    return ctx.on("message.tool_result", async (event) => {
      if (event.isError || !event.messageId) return;
      if (event.toolName !== "browser" && event.toolName !== "desktop_recording") return;

      const result = event.result as {
        content?: Array<{ type?: string; text?: string }>;
        details?: { action?: string; path?: string | null };
      };
      const details = result.details;
      const path = details?.path;
      if (!path || !isAbsolute(path)) return;
      const isRecording =
        (event.toolName === "browser" && details?.action === "stop_recording") ||
        (event.toolName === "desktop_recording" &&
          result.content?.some((part) => part.text?.includes("recording saved:")));
      const isScreenshot =
        details?.action === "screenshot" &&
        (event.toolName === "browser" || event.toolName === "desktop_recording");
      if (!isRecording && !isScreenshot) return;

      const relativePath = relative(ctx.session.dir, path);
      if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`)) return;
      const asset: MessageAsset = {
        scope: "session",
        path: relativePath.split(sep).join("/"),
        name: isScreenshot
          ? event.toolName === "browser"
            ? "Browser screenshot"
            : "Desktop screenshot"
          : event.toolName === "browser"
            ? "Browser recording"
            : "Desktop recording",
        mediaType: isScreenshot ? "image/png" : "video/webm",
      };
      const meta = await ctx.session.messages.getMeta(event.messageId);
      const existing = Array.isArray(meta.assets) ? meta.assets : [];
      await ctx.session.messages.patchMeta(event.messageId, { assets: [...existing, asset] });
    });
  },
};

export default messageAssetsExtension;
