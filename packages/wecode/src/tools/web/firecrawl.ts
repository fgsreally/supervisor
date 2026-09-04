import type { WebSearchResult } from "./duckduckgo.js";

async function request<T>(path: string, body: object, apiKey: string, signal?: AbortSignal) {
  const response = await fetch(`https://api.firecrawl.dev/v2${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error(`Firecrawl request failed (${response.status})`);
  return (await response.json()) as T;
}

export async function searchFirecrawl(
  query: string,
  limit: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const data = await request<{
    data?: { web?: Array<{ title?: string; url?: string; description?: string }> };
  }>("/search", { query, limit, sources: ["web"] }, apiKey, signal);
  return (data.data?.web ?? []).flatMap((result) =>
    result.title && result.url
      ? [{ title: result.title, url: result.url, snippet: result.description }]
      : [],
  );
}

export async function scrapeFirecrawl(
  url: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const data = await request<{ success?: boolean; data?: { markdown?: string }; error?: string }>(
    "/scrape",
    { url, formats: ["markdown"], onlyMainContent: true },
    apiKey,
    signal,
  );
  if (!data.data?.markdown) throw new Error(data.error ?? "Firecrawl returned no content");
  return data.data.markdown;
}
