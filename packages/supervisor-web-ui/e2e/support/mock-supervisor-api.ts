import type { Page, Route } from "@playwright/test";

const provider = {
  id: 1,
  slug: "visual-provider",
  name: "Visual Provider",
  icon: null,
  protocol: "chat-completions",
  baseUrl: "https://example.invalid/v1",
  apiKey: null,
  isEnabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const model = {
  id: 1,
  providerId: 1,
  modelId: "visual-model",
  name: "Visual Model",
  contextWindow: 128000,
  supportsVision: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function handleApi(route: Route) {
  const url = new URL(route.request().url());
  const path = (url.pathname.replace(/^\/api(?=\/|$)/, "").replace(/\/+$/, "") || "/");

  if (path === "/auth/status") return json(route, { required: false, authenticated: true });
  if (path === "/healthz") return json(route, { ok: true, tunnelQuick: false });
  if (path === "/providers") return json(route, [provider]);
  if (path === "/providers/1/models") return json(route, [model]);
  if (path === "/projects") return json(route, []);
  if (path === "/sessions") return json(route, []);
  if (path === "/agents/detect") return json(route, []);
  if (path === "/agents") return json(route, []);
  if (path === "/resources/global") {
    return json(route, { skills: [], prompts: [], extensions: [], mcp: [] });
  }
  if (path === "/settings") return json(route, {});

  // Keep optional dashboard requests deterministic without requiring a large fixture.
  if (path.startsWith("/home/") || path.startsWith("/external-sessions")) {
    return json(route, []);
  }

  return json(route, {});
}

export async function mockSupervisorApi(page: Page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/src/")) {
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/healthz") || url.pathname.startsWith("/providers") || url.pathname.startsWith("/projects") || url.pathname.startsWith("/sessions") || url.pathname.startsWith("/agents") || url.pathname.startsWith("/resources") || url.pathname.startsWith("/settings") || url.pathname.startsWith("/home/") || url.pathname.startsWith("/external-sessions")) {
        await handleApi(route);
        return;
      }
    }
    await route.continue();
  });
}
