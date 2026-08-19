import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPreviewUpstreamUrl,
  proxySessionPreviewRequest,
  rewriteSessionPreviewText,
  type SessionPreviewTarget,
} from "../src/core/session/session-preview-proxy.js";

const target: SessionPreviewTarget = {
  scriptName: "web",
  port: 4397,
  proxyBasePath: "/sessions/122/preview/web",
  basePath: "/",
  subPath: "/",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("session preview path proxy", () => {
  it("rewrites Vite HTML and module imports through the Session prefix", () => {
    const requestUrl = new URL("http://127.0.0.1:3042/sessions/122/preview/web/?password=123456");
    const html = rewriteSessionPreviewText(
      '<script type="module" src="/@vite/client"></script><link href="/favicon.svg">',
      "text/html",
      target,
      requestUrl,
    );
    expect(html).toContain('src="/sessions/122/preview/web/@vite/client?password=123456"');
    expect(html).toContain('href="/sessions/122/preview/web/favicon.svg?password=123456"');
    expect(html).toContain('id="supervisor-preview-scrollbars"');
    expect(html).toContain("scrollbar-width:none");

    const module = rewriteSessionPreviewText(
      'import App from "/src/App.vue"; import { createApp } from "/node_modules/.vite/deps/vue.js?v=1";',
      "text/javascript",
      target,
      requestUrl,
    );
    expect(module).toContain('from "/sessions/122/preview/web/src/App.vue?password=123456"');
    expect(module).toContain(
      'from "/sessions/122/preview/web/node_modules/.vite/deps/vue.js?v=1&password=123456"',
    );
  });

  it("does not forward the Supervisor password to the upstream app", () => {
    const upstream = buildPreviewUpstreamUrl(
      { ...target, subPath: "/src/main.ts" },
      new URL("http://127.0.0.1:3042/sessions/122/preview/web/src/main.ts?v=1&password=123456"),
    );
    expect(upstream.href).toBe("http://127.0.0.1:4397/src/main.ts?v=1");
  });

  it("waits for a newly started preview service", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("IPv4 refused"))
      .mockRejectedValueOnce(new Error("IPv6 refused"))
      .mockResolvedValueOnce(
        new Response("<html><head></head><body>ready</body></html>", {
          headers: { "content-type": "text/html" },
        }),
      );

    const response = await proxySessionPreviewRequest(
      new Request("http://127.0.0.1:3042/sessions/122/preview/web/"),
      target,
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await response.text()).toContain("ready");
  });

  it("keeps Vite HMR imports and WebSocket traffic on the preview prefix", () => {
    const client = rewriteSessionPreviewText(
      [
        'const socketHost = `${host}:${port}${"/"}`;',
        'const base$1 = "/" || "/";',
        'const base = "/" || "/";',
        'new WebSocket(`${socketProtocol}://${socketHost}?token=${wsToken}`, "vite-hmr");',
        'base + acceptedPath.slice(1) + `?t=${timestamp}${query ? `&${query}` : ""}`;',
      ].join("\n"),
      "text/javascript",
      target,
      new URL("http://127.0.0.1:3042/sessions/122/preview/web/@vite/client?password=123456"),
    );

    expect(client).toContain('const base = "/sessions/122/preview/web/";');
    expect(client).toContain('${"/sessions/122/preview/web/"}');
    expect(client).toContain("?token=${wsToken}&password=123456");
    expect(client).toContain("&password=123456`");
  });
});
