import { readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import type { ExtensionDefinition, MessageAsset } from "../../types.js";

const OUTPUTS_DIR = "outputs";

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

const messageAssetsExtension: ExtensionDefinition = {
  name: "message-assets",
  async setup(ctx) {
    const seenOutputs = new Map<string, string>();
    for (const record of await scanArtifactDir(ctx.session.dir, OUTPUTS_DIR)) {
      seenOutputs.set(record.asset.path, record.fingerprint);
    }
    let scanScheduled = false;
    let roundEnded = false;

    const scanOutputs = async (): Promise<void> => {
      scanScheduled = false;
      if (!roundEnded) return;
      roundEnded = false;
      const [target] = (await ctx.session.messages.list({ limit: 100 })).filter(
        (message) => message.role === "assistant",
      );
      if (!target) return;

      const assets: MessageAsset[] = [];
      for (const record of await scanArtifactDir(ctx.session.dir, OUTPUTS_DIR)) {
        if (seenOutputs.get(record.asset.path) === record.fingerprint) continue;
        seenOutputs.set(record.asset.path, record.fingerprint);
        assets.push(record.asset);
      }
      if (!assets.length) return;

      const message = await ctx.session.messages.get(target.id);
      if (!message) return;
      const meta = await message.meta.get();
      const existing = Array.isArray(meta.assets) ? meta.assets : [];
      const existingPaths = new Set(
        existing
          .filter((asset): asset is MessageAsset =>
            Boolean(asset && typeof asset.path === "string"),
          )
          .map((asset) => asset.path),
      );
      const nextMeta = await message.meta.patch({
        assets: [...existing, ...assets.filter((asset) => !existingPaths.has(asset.path))],
      });
      ctx.ui.broadcast({
        type: "message_meta_updated",
        messageId: target.id,
        meta: nextMeta,
        timestamp: Date.now(),
      });
    };

    const scheduleScan = (): void => {
      if (scanScheduled) return;
      scanScheduled = true;
      setTimeout(() => void scanOutputs(), 0);
    };

    ctx.on("agent.end", () => {
      roundEnded = true;
      scheduleScan();
    });
    return ctx.on("message.assistant", () => {
      if (roundEnded) scheduleScan();
    });
  },
};

export default messageAssetsExtension;
