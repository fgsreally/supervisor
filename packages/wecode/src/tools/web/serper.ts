import type { WebSearchResult } from "./duckduckgo.js";

export async function searchSerper(
  query: string,
  limit: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ q: query, num: limit }),
    signal,
  });
  if (!response.ok) throw new Error(`Serper request failed (${response.status})`);
  const data = (await response.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  return (data.organic ?? []).flatMap((result) =>
    result.title && result.link
      ? [{ title: result.title, url: result.link, snippet: result.snippet }]
      : [],
  );
}
