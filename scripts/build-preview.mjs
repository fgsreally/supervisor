import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = resolve(root, "playground");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const node = process.execPath;
const port = process.env.WECODE_BUILD_PORT ?? "3043";
const statusPath = resolve(tmpdir(), `wecode-build-preview-${port}.json`);
const waitForDev = process.argv.includes("--wait-dev");
let stopping = false;
let activeServer = null;

function writeStatus(phase, progress) {
  writeFileSync(statusPath, JSON.stringify({ phase, progress, updatedAt: Date.now() }));
}

async function waitForDevApi() {
  if (!waitForDev) return;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3042/healthz");
      if (response.ok) return;
    } catch {
      // The dev backend is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error("Dev backend did not become ready within 120 seconds");
}

function run(command, args, env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
      windowsHide: false,
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (signal) rejectRun(new Error(`${command} stopped by ${signal}`));
      else if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function build() {
  writeStatus("准备构建", 5);
  writeStatus("构建后端", 25);
  await run(pnpm, ["run", "build:preview"], {
    ...process.env,
    VITE_WECODE_BUILD_PREVIEW: "1",
  });
  writeStatus("启动预览", 90);
}

function startServer() {
  return new Promise((resolveExit, rejectStart) => {
    const child = spawn(
      node,
      [
        "packages/wecode/dist/cli.mjs",
        "serve",
        "--port",
        port,
        "--home",
        workspace,
        "--workspace",
        workspace,
        "--password",
        process.env.WECODE_BUILD_PASSWORD ?? "123456",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          WECODE_BUILD_PREVIEW: "1",
          WECODE_RUNTIME_LOCK_SUFFIX: "build-preview",
        },
        stdio: "inherit",
        windowsHide: false,
      },
    );
    activeServer = child;
    child.once("spawn", () => {
      writeStatus("预览启动中", 95);
      void waitForPreviewApi(child);
    });
    child.once("error", rejectStart);
    child.once("exit", (code, signal) => {
      activeServer = null;
      if (signal && !stopping) rejectStart(new Error(`build preview stopped by ${signal}`));
      else resolveExit(signal ? 0 : (code ?? 1));
    });
  });
}

async function waitForPreviewApi(child) {
  while (!stopping && activeServer === child) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) {
        writeStatus("预览已启动", 100);
        return;
      }
    } catch {
      // The preview process exists but is not listening yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
}

await waitForDevApi();

function stop() {
  stopping = true;
  activeServer?.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

for (;;) {
  try {
    await build();
    const code = await startServer();
    if (stopping || code !== 75) process.exitCode = code;
    if (stopping || code !== 75) break;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    break;
  }
}
