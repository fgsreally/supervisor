import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { promisify } from "node:util";

interface RecordingParams {
  action: "start" | "stop" | "status" | "screenshot";
  path?: string;
  fps?: number;
}

const execFileAsync = promisify(execFile);

function screenshotInputArgs(): string[] {
  if (process.platform === "win32") return ["-f", "gdigrab", "-i", "desktop"];
  if (process.platform === "darwin") return ["-f", "avfoundation", "-i", "1:none"];
  const display = process.env.DISPLAY;
  if (!display) throw new Error("desktop capture on Linux requires DISPLAY");
  return ["-f", "x11grab", "-i", display];
}

function captureArgs(path: string, fps: number): string[] {
  if (process.platform === "win32") {
    return [
      "-y",
      "-f",
      "gdigrab",
      "-framerate",
      String(fps),
      "-i",
      "desktop",
      "-c:v",
      "libvpx-vp9",
      path,
    ];
  }
  if (process.platform === "darwin") {
    return [
      "-y",
      "-f",
      "avfoundation",
      "-framerate",
      String(fps),
      "-i",
      "1:none",
      "-c:v",
      "libvpx-vp9",
      path,
    ];
  }
  const display = process.env.DISPLAY;
  if (!display) throw new Error("desktop recording on Linux requires DISPLAY");
  return [
    "-y",
    "-f",
    "x11grab",
    "-framerate",
    String(fps),
    "-i",
    display,
    "-c:v",
    "libvpx-vp9",
    path,
  ];
}

export function createDesktopRecordingTool(storageDir: string): {
  tool: AgentTool;
  cleanup: () => Promise<void>;
} {
  let processHandle: ChildProcessWithoutNullStreams | undefined;
  let currentPath: string | undefined;

  const stop = async (): Promise<string | undefined> => {
    if (!processHandle) return undefined;
    const child = processHandle;
    const path = currentPath;
    processHandle = undefined;
    currentPath = undefined;
    await new Promise<void>((done) => {
      child.once("exit", () => done());
      child.stdin.write("q\n");
      setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, 5_000).unref();
    });
    return path;
  };

  const tool: AgentTool = {
    name: "desktop_recording",
    label: "desktop_recording",
    description:
      "Record or screenshot the full desktop during computer-use E2E tests. Recordings are WebM artifacts and screenshots are PNG artifacts.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["start", "stop", "status", "screenshot"] },
        path: { type: "string", description: "Optional .webm or .png output path." },
        fps: { type: "number", description: "Frames per second (default 15, max 30)." },
      },
      required: ["action"],
    },
    async execute(_id, params: RecordingParams): Promise<AgentToolResult> {
      if (params.action === "status") {
        return {
          content: [
            { type: "text", text: processHandle ? `Recording: ${currentPath}` : "Not recording." },
          ],
        };
      }
      if (params.action === "stop") {
        const path = await stop();
        return {
          content: [
            {
              type: "text",
              text: path ? `Desktop recording saved: ${path}` : "No active desktop recording.",
            },
          ],
          details: { path },
        };
      }
      if (params.action === "screenshot") {
        const path = params.path
          ? isAbsolute(params.path)
            ? params.path
            : resolve(storageDir, params.path)
          : join(storageDir, "screenshots", `desktop-${Date.now()}.png`);
        await mkdir(dirname(path), { recursive: true });
        try {
          await execFileAsync(ffmpeg.path, [
            "-y",
            ...screenshotInputArgs(),
            "-frames:v",
            "1",
            path,
          ]);
          return {
            content: [{ type: "text", text: `Desktop screenshot saved: ${path}` }],
            details: { action: "screenshot", path },
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Desktop screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
      if (processHandle)
        return {
          content: [{ type: "text", text: `Already recording: ${currentPath}` }],
          isError: true,
        };
      const fps = Math.min(30, Math.max(1, Math.floor(params.fps ?? 15)));
      const path = params.path
        ? isAbsolute(params.path)
          ? params.path
          : resolve(storageDir, params.path)
        : join(storageDir, "recordings", `desktop-${Date.now()}.webm`);
      await mkdir(dirname(path), { recursive: true });
      processHandle = spawn(ffmpeg.path, captureArgs(path, fps), {
        stdio: ["pipe", "ignore", "pipe"],
      });
      currentPath = path;
      let startupError = "";
      processHandle.stderr.on("data", (chunk) => {
        startupError += String(chunk);
      });
      await new Promise((done) => setTimeout(done, 250));
      if (processHandle.exitCode !== null) {
        processHandle = undefined;
        currentPath = undefined;
        return {
          content: [{ type: "text", text: `Desktop recording failed: ${startupError.trim()}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Desktop recording started: ${path}` }],
        details: { path, fps },
      };
    },
  };

  return {
    tool,
    cleanup: async () => {
      await stop();
    },
  };
}
