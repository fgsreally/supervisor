import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createJiti } from "jiti";

interface PiTool {
  name: string;
  label?: string;
  description?: string;
  parameters: unknown;
  execute: (...args: unknown[]) => Promise<unknown>;
}

const execFileAsync = promisify(execFile);

async function ensureWindowsHelper(packageRoot: string): Promise<void> {
  if (process.platform !== "win32") return;
  const destination =
    process.env.PI_COMPUTER_USE_WINDOWS_HELPER_PATH ??
    join(homedir(), ".pi", "agent", "helpers", "pi-computer-use", "windows-bridge.exe");
  if (
    await stat(destination)
      .then(() => true)
      .catch(() => false)
  )
    return;
  const manifest = join(packageRoot, "native", "windows", "bridge-rs", "Cargo.toml");
  const targetDir = join(tmpdir(), "pi-computer-use-cargo-target");
  try {
    await execFileAsync("cargo", ["build", "--release", "--manifest-path", manifest], {
      env: { ...process.env, CARGO_TARGET_DIR: targetDir },
      timeout: 10 * 60_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `pi-computer-use Windows helper is missing and automatic Cargo build failed: ${message}`,
    );
  }
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(targetDir, "release", "windows-bridge.exe"), destination);
}

export async function createComputerUseTools(cwd: string): Promise<{
  tools: AgentTool[];
  cleanup: () => Promise<void>;
}> {
  const require = createRequire(import.meta.url);
  const packageRoot = dirname(require.resolve("@injaneity/pi-computer-use/package.json"));
  await ensureWindowsHelper(packageRoot);
  const extensionPath = join(packageRoot, "extensions", "computer-use.ts");
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  const extension = (await jiti.import(extensionPath, { default: true })) as (
    api: Record<string, unknown>,
  ) => void;
  const registered: PiTool[] = [];
  const shutdownHandlers: Array<() => Promise<void>> = [];
  extension({
    registerTool: (tool: PiTool) => registered.push(tool),
    registerCommand: () => {},
    on: (event: string, handler: () => Promise<void>) => {
      if (event === "session_shutdown") shutdownHandlers.push(handler);
    },
  });

  const context = {
    cwd,
    hasUI: false,
    sessionManager: { getBranch: () => [] },
    ui: { notify: () => {} },
  };
  const tools = registered.map<AgentTool>((tool) => ({
    name: tool.name,
    label: tool.label ?? tool.name,
    description: tool.description ?? tool.name,
    parameters: tool.parameters as AgentTool["parameters"],
    execute: async (toolCallId, params, signal) =>
      (await tool.execute(toolCallId, params, signal, undefined, context)) as Awaited<
        ReturnType<AgentTool["execute"]>
      >,
  }));

  return {
    tools,
    cleanup: async () => {
      for (const handler of shutdownHandlers) await handler();
    },
  };
}
