import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Page, ScreenRecorder } from "puppeteer-core";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { createBrowserSession, type BrowserSession } from "./registry.js";

const DEFAULT_TAB = "main";

interface BrowserParams {
  action: "open" | "close" | "run" | "screenshot" | "start_recording" | "stop_recording";
  name?: string;
  url?: string;
  viewport?: { width: number; height: number };
  code?: string;
  path?: string;
  timeout?: number;
  all?: boolean;
}

function clampTimeout(seconds: number | undefined): number {
  if (seconds === undefined || !Number.isFinite(seconds)) return 30_000;
  return Math.min(120_000, Math.max(1_000, Math.floor(seconds * 1000)));
}

function createTabHelpers(page: Page) {
  return {
    async title(): Promise<string> {
      return page.title();
    },
    async url(): Promise<string> {
      return page.url();
    },
    async content(): Promise<string> {
      return page.content();
    },
    async text(selector: string): Promise<string | null> {
      return page.$eval(selector, (el) => el.textContent?.trim() ?? null).catch(() => null);
    },
    async click(selector: string): Promise<void> {
      await page.click(selector);
    },
    async type(selector: string, text: string): Promise<void> {
      await page.type(selector, text);
    },
    async fill(selector: string, value: string): Promise<void> {
      await page.click(selector, { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.type(selector, value);
    },
    async screenshot(): Promise<string> {
      const buffer = await page.screenshot({ encoding: "base64", type: "png" });
      return typeof buffer === "string" ? buffer : Buffer.from(buffer).toString("base64");
    },
    async waitForSelector(selector: string, timeout = 10_000): Promise<void> {
      await page.waitForSelector(selector, { timeout });
    },
    async evaluate<T>(fn: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T> {
      if (typeof fn === "string") {
        return page.evaluate(fn) as Promise<T>;
      }
      return page.evaluate(fn, ...args) as Promise<T>;
    },
  };
}

async function runInPage(page: Page, code: string, timeoutMs: number): Promise<unknown> {
  const tab = createTabHelpers(page);
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
    ...args: string[]
  ) => (...args: unknown[]) => Promise<unknown>;
  const fn = new AsyncFunction("page", "tab", `"use strict";\n${code}`);
  return await Promise.race([
    fn(page, tab),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`browser run timed out after ${timeoutMs / 1000}s`)),
        timeoutMs,
      ),
    ),
  ]);
}

async function installRecordingCursor(page: Page): Promise<void> {
  const install = () => {
    if (document.getElementById("__supervisor_recording_cursor")) return;
    const cursor = document.createElement("div");
    cursor.id = "__supervisor_recording_cursor";
    cursor.style.cssText =
      "position:fixed;left:0;top:0;width:18px;height:18px;border:3px solid #ff3b30;border-radius:50%;background:rgba(255,255,255,.45);pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);transition:width .12s,height .12s,background .12s";
    document.documentElement.appendChild(cursor);
    document.addEventListener(
      "pointermove",
      (event) => {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
      },
      true,
    );
    document.addEventListener(
      "pointerdown",
      () => {
        cursor.style.width = "30px";
        cursor.style.height = "30px";
        cursor.style.background = "rgba(255,59,48,.45)";
        setTimeout(() => {
          cursor.style.width = "18px";
          cursor.style.height = "18px";
          cursor.style.background = "rgba(255,255,255,.45)";
        }, 180);
      },
      true,
    );
  };
  await page.evaluateOnNewDocument(install);
  await page.evaluate(install);
}

export function createBrowserTool(options?: {
  headless?: boolean;
  cwd?: string;
  sessionDir?: string;
}): {
  tool: AgentTool;
  cleanup: () => Promise<void>;
} {
  const session: BrowserSession = createBrowserSession(options);
  const recordings = new Map<string, { recorder: ScreenRecorder; path: string }>();

  const tool: AgentTool = {
    name: "browser",
    label: "browser",
    description:
      `Control a ${options?.headless === false ? "headed" : "headless"} Chromium browser. Stateful named tabs persist across calls.\n\n` +
      "Actions:\n" +
      "- open: create or reuse a tab (default name 'main'), optionally navigate to url\n" +
      "- run: execute async JavaScript with `page` (puppeteer Page) and `tab` helpers in scope\n" +
      "- close: release a tab or all tabs (all=true)\n\n" +
      "- screenshot: save the named tab as a PNG artifact\n" +
      "- start_recording / stop_recording: record the named tab to a WebM artifact\n\n" +
      "tab helpers: title(), url(), content(), text(selector), click(selector), type(selector, text), " +
      "fill(selector, value), screenshot() (returns base64 PNG), waitForSelector(selector), evaluate(fn)\n\n" +
      "Use for JS-rendered pages, login flows, and interactive browsing. For static pages prefer web_fetch.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["open", "close", "run", "screenshot", "start_recording", "stop_recording"],
          description: "Operation to perform.",
        },
        name: {
          type: "string",
          description: "Tab name (default 'main').",
        },
        url: {
          type: "string",
          description: "URL to open (for action=open).",
        },
        viewport: {
          type: "object",
          properties: {
            width: { type: "number" },
            height: { type: "number" },
          },
          description: "Viewport size for action=open.",
        },
        code: {
          type: "string",
          description: "JavaScript body for action=run. Has page and tab in scope.",
        },
        path: {
          type: "string",
          description: "Optional output path for screenshot (.png) or start_recording (.webm).",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds for action=run (default 30, max 120).",
        },
        all: {
          type: "boolean",
          description: "Close all tabs (for action=close).",
        },
      },
      required: ["action"],
    },
    async execute(
      _toolCallId: string,
      params: BrowserParams,
      signal?: AbortSignal,
    ): Promise<AgentToolResult> {
      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "browser: aborted" }],
          isError: true,
        };
      }

      const tabName = params.name?.trim() || DEFAULT_TAB;
      const timeoutMs = clampTimeout(params.timeout);

      try {
        if (params.action === "open") {
          const handle = await session.openTab(tabName, params.url, params.viewport);
          const title = await handle.page.title();
          const currentUrl = handle.page.url();
          return {
            content: [
              {
                type: "text",
                text: [`Opened tab "${tabName}".`, `Title: ${title}`, `URL: ${currentUrl}`].join(
                  "\n",
                ),
              },
            ],
            details: { action: "open", name: tabName, url: currentUrl, title },
          };
        }

        if (params.action === "close") {
          if (params.all) {
            await session.closeAll();
            return {
              content: [{ type: "text", text: "Closed all browser tabs." }],
              details: { action: "close", all: true },
            };
          }
          await session.closeTab(tabName);
          return {
            content: [{ type: "text", text: `Closed tab "${tabName}".` }],
            details: { action: "close", name: tabName },
          };
        }

        if (params.action === "run") {
          const code = params.code?.trim();
          if (!code) {
            return {
              content: [{ type: "text", text: "Error: code is required for action=run." }],
              isError: true,
            };
          }

          let handle = session.getTab(tabName);
          if (!handle) {
            handle = await session.openTab(tabName);
          }

          const result = await runInPage(handle.page, code, timeoutMs);
          const resultText =
            result === undefined
              ? "(undefined)"
              : typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2);

          return {
            content: [{ type: "text", text: `Tab "${tabName}" run result:\n${resultText}` }],
            details: { action: "run", name: tabName, result },
          };
        }

        if (params.action === "screenshot") {
          let handle = session.getTab(tabName);
          if (!handle) handle = await session.openTab(tabName, params.url, params.viewport);
          const baseDir = options?.sessionDir ?? options?.cwd ?? process.cwd();
          const safeTabName = tabName.replace(/[^A-Za-z0-9._-]+/g, "-");
          const outputPath = params.path
            ? isAbsolute(params.path)
              ? params.path
              : resolve(baseDir, params.path)
            : join(baseDir, "screenshots", `browser-${safeTabName}-${Date.now()}.png`);
          await mkdir(dirname(outputPath), { recursive: true });
          const image = await handle.page.screenshot({ path: outputPath, type: "png" });
          return {
            content: [
              { type: "text", text: `Browser screenshot saved: ${outputPath}` },
              {
                type: "image",
                data: Buffer.from(image).toString("base64"),
                mimeType: "image/png",
              },
            ],
            details: { action: "screenshot", name: tabName, path: outputPath },
          };
        }

        if (params.action === "start_recording") {
          if (recordings.has(tabName)) throw new Error(`tab "${tabName}" is already recording`);
          let handle = session.getTab(tabName);
          if (!handle) handle = await session.openTab(tabName, params.url, params.viewport);
          const baseDir = options?.sessionDir ?? options?.cwd ?? process.cwd();
          const safeTabName = tabName.replace(/[^A-Za-z0-9._-]+/g, "-");
          const outputPath = params.path
            ? isAbsolute(params.path)
              ? params.path
              : resolve(baseDir, params.path)
            : join(baseDir, "recordings", `browser-${safeTabName}-${Date.now()}.webm`);
          await mkdir(dirname(outputPath), { recursive: true });
          await installRecordingCursor(handle.page);
          const recorder = await handle.page.screencast({
            path: outputPath as `${string}.webm`,
            ffmpegPath: ffmpeg.path,
            fps: 30,
          });
          recordings.set(tabName, { recorder, path: outputPath });
          return {
            content: [{ type: "text", text: `Browser recording started: ${outputPath}` }],
            details: { action: "start_recording", name: tabName, path: outputPath },
          };
        }

        if (params.action === "stop_recording") {
          const recording = recordings.get(tabName);
          if (!recording) throw new Error(`tab "${tabName}" is not recording`);
          await recording.recorder.stop();
          recordings.delete(tabName);
          return {
            content: [{ type: "text", text: `Browser recording saved: ${recording.path}` }],
            details: { action: "stop_recording", name: tabName, path: recording.path },
          };
        }

        return {
          content: [{ type: "text", text: `Unknown action: ${String(params.action)}` }],
          isError: true,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `browser failed: ${message}` }],
          isError: true,
        };
      }
    },
  };

  return {
    tool,
    cleanup: async () => {
      for (const recording of recordings.values()) await recording.recorder.stop().catch(() => {});
      recordings.clear();
      await session.dispose();
    },
  };
}
