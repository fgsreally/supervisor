import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { mkdir, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Page } from "playwright";
import { createBrowserSession, type BrowserSession } from "./registry.js";

const DEFAULT_TAB = "main";

type BrowserAction =
  | "open"
  | "close"
  | "run"
  | "screenshot"
  | "start"
  | "show_actions"
  | "chapter"
  | "overlay"
  | "complete"
  | "abort";

const IDLE_ACTIONS: BrowserAction[] = ["open", "close", "run", "screenshot", "start"];
const RECORDING_ACTIONS: BrowserAction[] = [
  "open",
  "close",
  "run",
  "screenshot",
  "show_actions",
  "chapter",
  "overlay",
  "complete",
  "abort",
];

interface BrowserParams {
  action: BrowserAction;
  name?: string;
  url?: string;
  viewport?: { width: number; height: number };
  code?: string;
  path?: string;
  timeout?: number;
  all?: boolean;
  title?: string;
  description?: string;
  html?: string;
  text?: string;
  duration?: number;
  position?: "top-left" | "top" | "top-right" | "bottom-left" | "bottom" | "bottom-right";
  fontSize?: number;
  cursor?: "none" | "pointer";
  enabled?: boolean;
}

interface RecordingState {
  page: Page;
  path: string;
  actions: { dispose(): Promise<void> } | null;
  overlays: Array<{ dispose(): Promise<void> }>;
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
      return page
        .locator(selector)
        .first()
        .textContent()
        .then((value) => value?.trim() ?? null)
        .catch(() => null);
    },
    async click(selector: string): Promise<void> {
      await page.locator(selector).first().click();
    },
    async type(selector: string, text: string): Promise<void> {
      await page.locator(selector).first().pressSequentially(text);
    },
    async fill(selector: string, value: string): Promise<void> {
      await page.locator(selector).first().fill(value);
    },
    async press(key: string): Promise<void> {
      await page.keyboard.press(key);
    },
    async screenshot(): Promise<string> {
      const buffer = await page.screenshot({ type: "png" });
      return Buffer.from(buffer).toString("base64");
    },
    async waitForSelector(selector: string, timeout = 10_000): Promise<void> {
      await page.locator(selector).first().waitFor({ state: "visible", timeout });
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

function overlayHtml(params: BrowserParams): string {
  if (params.html?.trim()) return params.html.trim();
  const text = params.text?.trim() || params.title?.trim();
  if (!text) throw new Error("html, text, or title is required for overlay");
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;pointer-events:none;font:600 28px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.45)"><div style="padding:16px 24px;border-radius:12px;background:rgba(0,0,0,.55)">${escaped}</div></div>`;
}

export function createBrowserTool(options?: {
  headless?: boolean;
  cwd?: string;
  sessionDir?: string;
  browserSession?: BrowserSession;
}): {
  tool: AgentTool;
  cleanup: () => Promise<void>;
} {
  const session = options?.browserSession ?? createBrowserSession(options);
  const recordings = new Map<string, RecordingState>();
  const actionValues = [...IDLE_ACTIONS];

  function updateActionSchema(): void {
    const next = recordings.size ? RECORDING_ACTIONS : IDLE_ACTIONS;
    actionValues.splice(0, actionValues.length, ...next);
  }

  async function ensureTab(
    tabName: string,
    url?: string,
    viewport?: { width: number; height: number },
  ) {
    const recording = recordings.get(tabName);
    if (recording && !recording.page.isClosed()) {
      if (viewport) await recording.page.setViewportSize(viewport);
      if (url) await recording.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      return { name: tabName, page: recording.page };
    }
    let handle = session.getTab(tabName);
    if (!handle) handle = await session.openTab(tabName, url, viewport);
    else {
      if (viewport) await handle.page.setViewportSize(viewport);
      if (url) await handle.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }
    return handle;
  }

  async function requireRecording(tabName: string): Promise<RecordingState> {
    const recording = recordings.get(tabName);
    if (!recording) throw new Error(`tab "${tabName}" is not recording`);
    return recording;
  }

  async function enableActions(
    recording: RecordingState,
    params: Pick<BrowserParams, "duration" | "position" | "fontSize" | "cursor">,
  ): Promise<void> {
    await recording.actions?.dispose();
    recording.actions = await recording.page.screencast.showActions({
      position: params.position ?? "top-right",
      duration: params.duration ?? 600,
      fontSize: params.fontSize ?? 24,
      cursor: params.cursor ?? "pointer",
    });
  }

  async function finishRecording(tabName: string, keepFile: boolean): Promise<string> {
    const recording = await requireRecording(tabName);
    recordings.delete(tabName);
    updateActionSchema();
    await recording.actions?.dispose().catch(() => {});
    recording.actions = null;
    await Promise.all(recording.overlays.map((overlay) => overlay.dispose().catch(() => {})));
    await recording.page.screencast.hideActions().catch(() => {});
    let stopError: unknown;
    try {
      await recording.page.screencast.stop();
    } catch (error) {
      stopError = error;
    }
    if (!keepFile || stopError) {
      await unlink(recording.path).catch(() => {});
    }
    if (stopError) throw stopError;
    return recording.path;
  }

  const tool: AgentTool = {
    name: "browser",
    label: "browser",
    description:
      `Control a ${options?.headless === false ? "headed" : "headless"} Chromium browser. Stateful named tabs persist across calls.\n\n` +
      "Actions:\n" +
      "- open: create or reuse a tab (default name 'main'), optionally navigate to url\n" +
      "- run: execute async JavaScript with `page` (Playwright Page) and `tab` helpers in scope\n" +
      "- close: release a tab or all tabs (all=true)\n" +
      "- screenshot: save the named tab as a PNG artifact\n" +
      "- start: start a Playwright WebM screencast and auto-enable action annotations\n" +
      "- show_actions / chapter / overlay: configure annotations while recording\n" +
      "- complete / abort: save or discard the recording and restore start\n\n" +
      "While recording, prefer tab.click/fill/type/press (Playwright locators) so actions are auto-annotated.\n" +
      "tab helpers: title(), url(), content(), text(selector), click(selector), type(selector, text), " +
      "fill(selector, value), press(key), screenshot() (returns base64 PNG), waitForSelector(selector), evaluate(fn)\n\n" +
      "Use for JS-rendered pages, login flows, and interactive browsing. For static pages prefer web_fetch.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: actionValues,
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
          description: "Optional output path for screenshot (.png) or start (.webm).",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds for action=run (default 30, max 120).",
        },
        all: {
          type: "boolean",
          description: "Close all tabs (for action=close).",
        },
        title: {
          type: "string",
          description: "Chapter title or overlay text fallback.",
        },
        description: {
          type: "string",
          description: "Chapter description.",
        },
        html: {
          type: "string",
          description: "Raw HTML for overlay.",
        },
        text: {
          type: "string",
          description: "Plain text for overlay (wrapped into a simple HTML badge).",
        },
        duration: {
          type: "number",
          description: "Duration in ms for chapter/overlay/action annotations.",
        },
        position: {
          type: "string",
          enum: ["top-left", "top", "top-right", "bottom-left", "bottom", "bottom-right"],
          description: "Action title position for show_actions (default top-right).",
        },
        fontSize: {
          type: "number",
          description: "Action title font size for show_actions (default 24).",
        },
        cursor: {
          type: "string",
          enum: ["none", "pointer"],
          description: "Cursor decoration for show_actions (default pointer).",
        },
        enabled: {
          type: "boolean",
          description: "Enable or disable action annotations (default true).",
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
          const handle = await ensureTab(tabName, params.url, params.viewport);
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
            for (const name of recordings.keys()) {
              await finishRecording(name, false).catch(() => {});
            }
            await session.closeAll();
            return {
              content: [{ type: "text", text: "Closed all browser tabs." }],
              details: { action: "close", all: true },
            };
          }
          if (recordings.has(tabName)) {
            await finishRecording(tabName, false).catch(() => {});
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

          const handle = await ensureTab(tabName);
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
          const handle = await ensureTab(tabName, params.url, params.viewport);
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

        if (params.action === "start") {
          if (recordings.size) throw new Error("a browser recording is already active");
          const handle = await ensureTab(tabName, params.url, params.viewport);
          const baseDir = options?.sessionDir ?? options?.cwd ?? process.cwd();
          const safeTabName = tabName.replace(/[^A-Za-z0-9._-]+/g, "-");
          const outputPath = params.path
            ? isAbsolute(params.path)
              ? params.path
              : resolve(baseDir, params.path)
            : join(baseDir, "recordings", `browser-${safeTabName}-${Date.now()}.webm`);
          await mkdir(dirname(outputPath), { recursive: true });

          // Same capability as playwright-cli video-show-actions: screencast + showActions.
          const recording: RecordingState = {
            page: handle.page,
            path: outputPath,
            actions: null,
            overlays: [],
          };
          try {
            await handle.page.screencast.start({ path: outputPath, size: params.viewport });
            await enableActions(recording, params);
            recordings.set(tabName, recording);
            updateActionSchema();
          } catch (error) {
            await handle.page.screencast.stop().catch(() => {});
            await unlink(outputPath).catch(() => {});
            updateActionSchema();
            throw error;
          }

          return {
            content: [
              {
                type: "text",
                text: `Browser recording started with action annotations: ${outputPath}`,
              },
            ],
            details: { action: "start", name: tabName, path: outputPath },
          };
        }

        if (params.action === "complete") {
          const outputPath = await finishRecording(tabName, true);
          return {
            content: [{ type: "text", text: `Browser recording saved: ${outputPath}` }],
            details: { action: "complete", name: tabName, path: outputPath },
          };
        }

        if (params.action === "abort") {
          const outputPath = await finishRecording(tabName, false);
          return {
            content: [{ type: "text", text: `Browser recording aborted: ${outputPath}` }],
            details: { action: "abort", name: tabName },
          };
        }

        if (params.action === "chapter") {
          const recording = await requireRecording(tabName);
          const title = params.title?.trim();
          if (!title) throw new Error("title is required for chapter");
          await recording.page.screencast.showChapter(title, {
            description: params.description,
            duration: params.duration ?? 2000,
          });
          return {
            content: [{ type: "text", text: `Chapter shown: ${title}` }],
            details: {
              action: "chapter",
              name: tabName,
              title,
              description: params.description ?? null,
            },
          };
        }

        if (params.action === "overlay") {
          const recording = await requireRecording(tabName);
          const html = overlayHtml(params);
          recording.overlays.push(
            await recording.page.screencast.showOverlay(html, { duration: params.duration }),
          );
          return {
            content: [{ type: "text", text: "Overlay shown." }],
            details: { action: "overlay", name: tabName },
          };
        }

        if (params.action === "show_actions") {
          const recording = await requireRecording(tabName);
          if (params.enabled === false) {
            await recording.actions?.dispose().catch(() => {});
            recording.actions = null;
            await recording.page.screencast.hideActions();
          } else {
            await enableActions(recording, params);
          }
          return {
            content: [
              {
                type: "text",
                text:
                  params.enabled === false
                    ? "Action annotations disabled."
                    : "Action annotations enabled.",
              },
            ],
            details: { action: "show_actions", name: tabName, enabled: params.enabled !== false },
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
      for (const name of recordings.keys()) {
        await finishRecording(name, false).catch(() => {});
      }
      recordings.clear();
      updateActionSchema();
      await session.dispose();
    },
  };
}
