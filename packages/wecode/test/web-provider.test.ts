import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebFetchTool } from "../src/tools/web/web-fetch-tool.js";
import { createWebSearchTool } from "../src/tools/web/web-search-tool.js";
import { encryptApiKey } from "../src/utils/encrypt.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TEST_TAVILY_API_KEY;
});

describe("Tavily web provider", () => {
  it("uses Tavily for search without exposing the API key", async () => {
    process.env.TEST_TAVILY_API_KEY = "secret-key";
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ title: "Example", url: "https://example.com", content: "Summary" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    const tool = createWebSearchTool({
      provider: "tavily",
      tavilyApiKeyEnv: "TEST_TAVILY_API_KEY",
    });
    const result = await tool.execute("call", { query: "example" });

    expect(result.isError).not.toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(JSON.stringify(result)).not.toContain("secret-key");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses Tavily Extract when selected", async () => {
    process.env.TEST_TAVILY_API_KEY = "secret-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [{ url: "https://example.com", raw_content: "Rendered content" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const tool = createWebFetchTool({
      provider: "tavily",
      tavilyApiKeyEnv: "TEST_TAVILY_API_KEY",
    });
    const result = await tool.execute("call", { url: "https://example.com" });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Rendered content"),
    });
  });

  it("uses an encrypted stored API key when the environment variable is absent", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ web: { results: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const tool = createWebSearchTool({
      provider: "brave",
      braveApiKeyEnv: "UNSET_BRAVE_TEST_KEY",
      braveApiKeyEncrypted: encryptApiKey("stored-secret"),
    });

    await tool.execute("call", { query: "example" });

    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "X-Subscription-Token": "stored-secret" }),
    });
  });

  it.each([
    [
      "brave" as const,
      "BRAVE_TEST_KEY",
      { web: { results: [{ title: "Brave", url: "https://brave.test", description: "Hit" }] } },
      "api.search.brave.com",
    ],
    [
      "serper" as const,
      "SERPER_TEST_KEY",
      { organic: [{ title: "Serper", link: "https://serper.test", snippet: "Hit" }] },
      "google.serper.dev",
    ],
    [
      "firecrawl" as const,
      "FIRECRAWL_TEST_KEY",
      {
        data: { web: [{ title: "Firecrawl", url: "https://firecrawl.test", description: "Hit" }] },
      },
      "api.firecrawl.dev",
    ],
  ])("uses the %s search provider", async (provider, envName, payload, expectedHost) => {
    process.env[envName] = "secret-key";
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const tool = createWebSearchTool({
      provider,
      braveApiKeyEnv: envName,
      serperApiKeyEnv: envName,
      firecrawlApiKeyEnv: envName,
    });

    const result = await tool.execute("call", { query: "example" });

    expect(result.isError).not.toBe(true);
    expect(String(fetch.mock.calls[0]?.[0])).toContain(expectedHost);
    delete process.env[envName];
  });

  it("uses Firecrawl Scrape when selected", async () => {
    process.env.FIRECRAWL_TEST_KEY = "secret-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { markdown: "Dynamic content" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const tool = createWebFetchTool({
      provider: "firecrawl",
      firecrawlApiKeyEnv: "FIRECRAWL_TEST_KEY",
    });

    const result = await tool.execute("call", { url: "https://example.com" });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Dynamic content"),
    });
    delete process.env.FIRECRAWL_TEST_KEY;
  });
});
