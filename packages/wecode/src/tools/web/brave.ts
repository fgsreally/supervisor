import type { WebSearchResult } from "./duckduckgo.js";

export async function searchBrave(
  query: string,
  limit: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(limit));
  url.searchParams.set("text_decorations", "false");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    signal,
  });
  if (!response.ok) throw new Error(`Brave Search request failed (${response.status})`);
  const data = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return (data.web?.results ?? []).flatMap((result) =>
    result.title && result.url
      ? [{ title: result.title, url: result.url, snippet: result.description }]
      : [],
  );
}
