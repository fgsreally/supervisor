import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Page } from "puppeteer-core";
import { createBrowserSession, type BrowserSession } from "./registry.js";

const DEFAULT_TAB = "main";

interface BrowserParams {
  action: "open" | "close" | "run";
  name?: string;
  url?: string;
  viewport?: { width: number; height: number };
  code?: string;
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

export function createBrowserTool(): { tool: AgentTool; cleanup: () => Promise<void> } {
  const session: BrowserSession = createBrowserSession();

  const tool: AgentTool = {
    name: "browser",
    label: "browser",
    description:
      "Control a headless Chromium browser. Stateful named tabs persist across calls.\n\n" +
      "Actions:\n" +
      "- open: create or reuse a tab (default name 'main'), optionally navigate to url\n" +
      "- run: execute async JavaScript with `page` (puppeteer Page) and `tab` helpers in scope\n" +
      "- close: release a tab or all tabs (all=true)\n\n" +
      "tab helpers: title(), url(), content(), text(selector), click(selector), type(selector, text), " +
      "fill(selector, value), screenshot() (returns base64 PNG), waitForSelector(selector), evaluate(fn)\n\n" +
      "Use for JS-rendered pages, login flows, and interactive browsing. For static pages prefer web_fetch.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["open", "close", "run"],
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
    cleanup: () => session.dispose(),
  };
}
