import { expect, test } from "@playwright/test";
import { mockSupervisorApi } from "./support/mock-supervisor-api";

test.describe("fixed visual baseline", () => {
  test.beforeEach(async ({ page }) => {
    await mockSupervisorApi(page);
    await page.addInitScript(() => {
      localStorage.clear();
      const theme = new URLSearchParams(window.location.search).get("theme");
      if (theme === "light" || theme === "dark") {
        localStorage.setItem("pi-example-theme", theme);
      }
    });
  });

  for (const theme of ["light", "dark"] as const) {
    test(`desktop ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/?visualBaseline=1&theme=${theme}`);
      await expect(page.locator(".app-root")).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveScreenshot(`shell-desktop-${theme}.png`, {
        animations: "disabled",
        caret: "hide",
      });
    });

    test(`mobile ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/?visualBaseline=1&theme=${theme}`);
      await expect(page.locator(".app-root")).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveScreenshot(`shell-mobile-${theme}.png`, {
        animations: "disabled",
        caret: "hide",
      });
    });
  }
});
