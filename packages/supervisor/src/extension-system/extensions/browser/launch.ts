import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Browser } from "puppeteer-core";

const DEFAULT_VIEWPORT = { width: 1365, height: 768, deviceScaleFactor: 1 };

let puppeteerModule: typeof import("puppeteer-core") | undefined;

async function loadPuppeteer(): Promise<typeof import("puppeteer-core")> {
  if (puppeteerModule) return puppeteerModule;
  puppeteerModule = await import("puppeteer-core");
  return puppeteerModule;
}

function getChromiumCacheDir(): string {
  return join(homedir(), ".pi", "supervisor", "chromium");
}

async function resolveChromiumExecutable(): Promise<string | undefined> {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  const browsers = await import("@puppeteer/browsers");
  const platform = browsers.detectBrowserPlatform();
  if (!platform) return undefined;

  const cacheDir = getChromiumCacheDir();
  const { PUPPETEER_REVISIONS } = await import("puppeteer-core/internal/revisions.js");
  const buildId = await browsers.resolveBuildId(
    browsers.Browser.CHROME,
    platform,
    PUPPETEER_REVISIONS.chrome,
  );
  const executablePath = browsers.computeExecutablePath({
    browser: browsers.Browser.CHROME,
    buildId,
    cacheDir,
    platform,
  });

  if (existsSync(executablePath)) return executablePath;

  await browsers.install({
    browser: browsers.Browser.CHROME,
    buildId,
    cacheDir,
    platform,
  });
  return executablePath;
}

export async function launchBrowser(headless = true): Promise<Browser> {
  const puppeteer = await loadPuppeteer();
  const executablePath = await resolveChromiumExecutable();
  if (!executablePath) {
    throw new Error(
      "Chromium not found. Set PUPPETEER_EXECUTABLE_PATH or allow automatic download on first use.",
    );
  }

  return puppeteer.default.launch({
    executablePath,
    headless,
    defaultViewport: DEFAULT_VIEWPORT,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}
