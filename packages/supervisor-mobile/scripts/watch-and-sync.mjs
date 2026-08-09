import { watch } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(mobileRoot, "../supervisor-web-ui/dist");
const platform = process.argv[2];
if (platform !== "android" && platform !== "ios") {
  console.error("Usage: node watch-and-sync.mjs <android|ios>");
  process.exit(1);
}

let debounceTimer = null;
let syncing = false;
let resyncQueued = false;

function runSync() {
  if (syncing) {
    resyncQueued = true;
    return;
  }
  syncing = true;
  console.log(`[cap] sync ${platform}…`);
  const child = spawn("pnpm", ["exec", "cap", "sync", platform], {
    cwd: mobileRoot,
    stdio: "inherit",
    shell: true,
  });
  child.on("exit", (code) => {
    syncing = false;
    if (code !== 0) {
      console.error(`[cap] sync ${platform} failed (${code ?? "unknown"})`);
    }
    if (resyncQueued) {
      resyncQueued = false;
      runSync();
    }
  });
}

function scheduleSync() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runSync, 400);
}

console.log(`[cap] watching ${distDir} → cap sync ${platform}`);
watch(distDir, { recursive: true }, scheduleSync);
