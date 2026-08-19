import { readdir, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, sep } from "node:path";
import type { ExtensionDefinition, MessageAsset } from "../../types.js";

const ARTIFACT_DIRS = ["scripts", "plans", "todos", "outputs"];

type ArtifactRecord = { asset: MessageAsset; fingerprint: string };

function artifactMediaType(path: string): string | undefined {
  switch (extname(path).toLowerCase()) {
    case ".csv":
      return "text/csv";
    case ".json":
      return "application/json";
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".html":
      return "text/html";
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webm":
      return "video/webm";
    default:
      return undefined;
  }
}

async function scanArtifactDir(root: string, dir: string): Promise<ArtifactRecord[]> {
  const records: ArtifactRecord[] = [];
  const walk = async (current: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const file = await stat(fullPath);
        const path = relative(root, fullPath).split(sep).join("/");
        records.push({
          asset: {
            scope: "session",
            path,
            name: basename(fullPath),
            mediaType: artifactMediaType(fullPath),
          },
          fingerprint: `${file.size}:${file.mtimeMs}`,
        });
      } catch {}
    }
  };
  await walk(join(root, dir));
  return records;
}

async function scanArtifacts(root: string): Promise<ArtifactRecord[]> {
  return (await Promise.all(ARTIFACT_DIRS.map((dir) => scanArtifactDir(root, dir)))).flat();
}

const messageAssetsExtension: ExtensionDefinition = {
  name: "message-assets",
  async setup(ctx) {
    const seenArtifacts = new Map<string, string>();
    for (const record of await scanArtifacts(ctx.session.dir)) {
      seenArtifacts.set(record.asset.path, record.fingerprint);
    }
    return ctx.on("message.tool_result", async (event) => {
      if (event.isError || !event.messageId) return;

      const result = event.result as {
        content?: Array<{ type?: string; text?: string }>;
        details?: { action?: string; path?: string | null; assets?: MessageAsset[] };
      };
      const details = result.details;
      const path = details?.path;
      const assets: MessageAsset[] = details?.assets ? [...details.assets] : [];
      const isRecording =
        (event.toolName === "browser" && details?.action === "complete") ||
        (event.toolName === "desktop_recording" &&
          result.content?.some((part) => part.text?.includes("recording saved:")));
      const isScreenshot =
        details?.action === "screenshot" &&
        (event.toolName === "browser" || event.toolName === "desktop_recording");
      if ((isRecording || isScreenshot) && path && isAbsolute(path)) {
        const relativePath = relative(ctx.session.dir, path);
        if (relativePath && relativePath !== ".." && !relativePath.startsWith(`..${sep}`)) {
          assets.push({
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
          });
        }
      }
      for (const record of await scanArtifacts(ctx.session.dir)) {
        if (seenArtifacts.get(record.asset.path) === record.fingerprint) continue;
        seenArtifacts.set(record.asset.path, record.fingerprint);
        assets.push(record.asset);
      }
      const uniqueAssets = [...new Map(assets.map((asset) => [asset.path, asset])).values()];
      if (!uniqueAssets.length) return;
      const meta = await ctx.session.messages.getMeta(event.messageId);
      const existing = Array.isArray(meta.assets) ? meta.assets : [];
      const existingPaths = new Set(
        existing
          .filter((asset): asset is MessageAsset =>
            Boolean(asset && typeof asset.path === "string"),
          )
          .map((asset) => asset.path),
      );
      await ctx.session.messages.patchMeta(event.messageId, {
        assets: [...existing, ...uniqueAssets.filter((asset) => !existingPaths.has(asset.path))],
      });
    });
  },
};

export default messageAssetsExtension;
