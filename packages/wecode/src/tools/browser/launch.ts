import type { Browser } from "playwright";
import { chromium } from "playwright";

export const DEFAULT_VIEWPORT = { width: 1365, height: 768 };

export async function launchBrowser(headless = true): Promise<Browser> {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_PATH ??
    process.env.PUPPETEER_EXECUTABLE_PATH ??
    process.env.CHROME_BIN;
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}
