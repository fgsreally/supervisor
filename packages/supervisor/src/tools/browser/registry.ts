import type { Browser, Page } from "puppeteer-core";
import { launchBrowser } from "./launch.js";

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
  const tabs = new Map<string, Page>();

  async function ensureBrowser(): Promise<Browser> {
    if (!browser || !browser.connected) {
      browser = await launchBrowser(options?.headless ?? true);
    }
    return browser;
  }

  return {
    async openTab(name, url, viewport) {
      const b = await ensureBrowser();
      const existing = tabs.get(name);
      if (existing && !existing.isClosed()) {
        if (viewport) await existing.setViewport(viewport);
        if (url) await existing.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        return { name, page: existing };
      }

      const page = await b.newPage();
      if (viewport) await page.setViewport(viewport);
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
      if (tabs.size === 0 && browser) {
        await browser.close();
        browser = null;
      }
    },

    async closeAll() {
      for (const name of tabs.keys()) {
        await this.closeTab(name);
      }
    },

    async dispose() {
      await this.closeAll();
      if (browser) {
        await browser.close();
        browser = null;
      }
    },
  };
}
