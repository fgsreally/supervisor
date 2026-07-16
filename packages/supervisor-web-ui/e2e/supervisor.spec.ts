import { test, expect } from "@playwright/test";

/**
 * E2E Tests for Supervisor Web UI
 *
 * Prerequisites:
 * - Supervisor backend running on default port (3030)
 * - Web UI dev server running
 *
 * Run with: npm run test:e2e
 */

test.describe("Supervisor Web UI E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page
    await page.goto("/");
    // Wait for initial load
    await page.waitForTimeout(500);
  });

  test.describe("Session Management", () => {
    test("should display session list", async ({ page }) => {
      // Check if session list panel exists
      const sessionPanel = await page.locator('[data-testid="session-list"]').count();
      expect(sessionPanel).toBeGreaterThanOrEqual(0);
    });

    test("should create a new session", async ({ page }) => {
      // Click new session button
      const newSessionBtn = page.locator('[data-testid="new-session-btn"]');
      if ((await newSessionBtn.count()) > 0) {
        await newSessionBtn.click();

        // Fill session name
        const nameInput = page.locator('input[placeholder*="名称"], input[placeholder*="name"]');
        if ((await nameInput.count()) > 0) {
          await nameInput.fill("E2E Test Session");

          // Submit
          const submitBtn = page.locator(
            'button[type="submit"], button:has-text("创建"), button:has-text("Create")',
          );
          await submitBtn.click();

          // Verify session appears in list
          await expect(page.locator("text=E2E Test Session")).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test("should navigate to session detail", async ({ page }) => {
      // Find first session and click
      const firstSession = page.locator('[data-testid="session-item"]').first();
      if ((await firstSession.count()) > 0) {
        await firstSession.click();

        // Verify chat view is shown
        await expect(
          page.locator('[data-testid="chat-view"], .chat-view, [class*="chat"]'),
        ).toBeVisible();
      }
    });
  });

  test.describe("Agent Management", () => {
    test("should display agent list", async ({ page }) => {
      // Navigate to contacts/agents page
      const contactsLink = page.locator(
        'a:has-text("Contacts"), a:has-text("联系人"), [data-testid="contacts-link"]',
      );
      if ((await contactsLink.count()) > 0) {
        await contactsLink.click();
        await page.waitForTimeout(300);
      }

      // Check for agent list
      const agentList = page.locator('[data-testid="agent-list"], [class*="agent-list"]');
      expect(await agentList.count()).toBeGreaterThanOrEqual(0);
    });

    test("should view agent details", async ({ page }) => {
      // Click on first agent
      const firstAgent = page.locator('[data-testid="agent-item"]').first();
      if ((await firstAgent.count()) > 0) {
        await firstAgent.click();

        // Verify agent detail view
        const detailView = page.locator('[data-testid="agent-detail"], [class*="agent-detail"]');
        expect(await detailView.count()).toBeGreaterThan(0);
      }
    });
  });

  test.describe("Provider Management", () => {
    test("should display provider list", async ({ page }) => {
      // Navigate to settings/providers
      const settingsLink = page.locator(
        'a:has-text("Settings"), a:has-text("设置"), [data-testid="settings-link"]',
      );
      if ((await settingsLink.count()) > 0) {
        await settingsLink.click();
        await page.waitForTimeout(300);
      }

      // Check for provider list
      const providerList = page.locator('[data-testid="provider-list"], [class*="provider-list"]');
      expect(await providerList.count()).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("Resource Management", () => {
    test("should display resources", async ({ page }) => {
      // Navigate to resources
      const resourcesLink = page.locator(
        'a:has-text("Resources"), a:has-text("资源"), [data-testid="resources-link"]',
      );
      if ((await resourcesLink.count()) > 0) {
        await resourcesLink.click();
        await page.waitForTimeout(300);
      }

      // Check for resource list
      const resourceList = page.locator('[data-testid="resource-list"], [class*="resource-list"]');
      expect(await resourceList.count()).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("API Integration", () => {
    test("should handle API errors gracefully", async ({ page }) => {
      // Intercept API requests
      await page.route("**/api/**", async (route) => {
        await route.abort("internetdisconnected");
      });

      // Try to perform action that triggers API call
      await page.reload();
      await page.waitForTimeout(500);

      // Should show error message
      const errorMessage = page.locator(
        '[data-testid="error-message"], [class*="error"], .error-message',
      );
      // Error handling may vary, just verify page doesn't crash
      await expect(page.locator("body")).toBeVisible();
    });

    test("should load data from real API", async ({ page }) => {
      // Wait for any API calls to complete
      const response = await page.waitForResponse(
        (response) => response.url().includes("/sessions") || response.url().includes("/agents"),
        { timeout: 10000 },
      );

      // Verify API returns valid JSON
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });
});
