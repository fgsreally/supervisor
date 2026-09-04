import { resolveApiKey } from "./credentials.js";

export interface TavilySearchResult {
  title: string;
  url: string;
  snippet?: string;
}

async function request<T>(
  path: string,
  body: object,
  envName: string,
  encrypted: string | undefined,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`https://api.tavily.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolveApiKey("Tavily", envName, encrypted)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error(`Tavily request failed (${response.status})`);
  return (await response.json()) as T;
}

export async function searchTavily(
  query: string,
  limit: number,
  envName: string,
  encrypted?: string,
  signal?: AbortSignal,
): Promise<TavilySearchResult[]> {
  const data = await request<{
    results?: Array<{ title?: string; url?: string; content?: string }>;
  }>(
    "/search",
    { query, max_results: limit, search_depth: "advanced" },
    envName,
    encrypted,
    signal,
  );
  return (data.results ?? []).flatMap((result) =>
    result.title && result.url
      ? [{ title: result.title, url: result.url, snippet: result.content }]
      : [],
  );
}

export async function extractTavily(
  url: string,
  envName: string,
  encrypted?: string,
  signal?: AbortSignal,
): Promise<string> {
  const data = await request<{
    results?: Array<{ url?: string; raw_content?: string }>;
    failed_results?: Array<{ url?: string; error?: string }>;
  }>(
    "/extract",
    { urls: [url], extract_depth: "advanced", format: "markdown" },
    envName,
    encrypted,
    signal,
  );
  const content = data.results?.[0]?.raw_content;
  if (!content) throw new Error(data.failed_results?.[0]?.error ?? "Tavily returned no content");
  return content;
}
