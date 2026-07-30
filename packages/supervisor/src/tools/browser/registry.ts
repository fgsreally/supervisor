import type { Browser, BrowserContext, Page } from "playwright";
import { DEFAULT_VIEWPORT, launchBrowser } from "./launch.js";

export interface TabHandle {
  name: string;
  page: Page;
}

export interface BrowserSession {
  openTab(
    name: string,
    url?: string,
    viewport?: { width: number; height: number },
  ): Promise<TabHandle>;
  getTab(name: string): TabHandle | undefined;
  closeTab(name: string): Promise<void>;
  closeAll(): Promise<void>;
  dispose(): Promise<void>;
}

export function createBrowserSession(options?: { headless?: boolean }): BrowserSession {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  const tabs = new Map<string, Page>();

  async function ensureContext(): Promise<BrowserContext> {
    if (browser?.isConnected() && context) return context;
    browser = await launchBrowser(options?.headless ?? true);
    context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
    return context;
  }

  async function closeBrowserIfIdle(): Promise<void> {
    if (tabs.size || !browser) return;
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
    context = null;
    browser = null;
  }

  return {
    async openTab(name, url, viewport) {
      const existing = tabs.get(name);
      if (existing && !existing.isClosed()) {
        if (viewport) await existing.setViewportSize(viewport);
        if (url) await existing.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        return { name, page: existing };
      }
      const page = await (await ensureContext()).newPage();
      if (viewport) await page.setViewportSize(viewport);
      if (url) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      tabs.set(name, page);
      return { name, page };
    },

    getTab(name) {
      const page = tabs.get(name);
      if (!page || page.isClosed()) return undefined;
      return { name, page };
    },

    async closeTab(name) {
      const page = tabs.get(name);
      if (!page) return;
      tabs.delete(name);
      if (!page.isClosed()) await page.close();
      await closeBrowserIfIdle();
    },

    async closeAll() {
      const pages = [...tabs.values()];
      tabs.clear();
      await Promise.all(pages.map((page) => (page.isClosed() ? undefined : page.close())));
      await closeBrowserIfIdle();
    },

    async dispose() {
      tabs.clear();
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
      context = null;
      browser = null;
    },
  };
}
