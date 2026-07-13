const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
}

function unwrapResultUrl(href: string): string | undefined {
  if (!href) return undefined;
  const decoded = href.replace(/&amp;/gi, "&");
  const wrapMatch = decoded.match(/[?&]uddg=([^&]+)/);
  if (wrapMatch) {
    try {
      return decodeURIComponent(wrapMatch[1]!);
    } catch {
      return undefined;
    }
  }
  if (decoded.startsWith("//")) return `https:${decoded}`;
  if (decoded.startsWith("http://") || decoded.startsWith("https://")) return decoded;
  return undefined;
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHtmlResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const blockRe =
    /<div\b[^>]*\bclass="[^"]*\bresult\b[^"]*"[^>]*>([\s\S]*?)(?=<div\b[^>]*\bclass="[^"]*\bresult\b|<div\b[^>]*\bclass="[^"]*\bnav-link\b|$)/g;
  const titleRe =
    /<a\b[^>]*\bclass="[^"]*\bresult__a\b[^"]*"[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
  const snippetRe =
    /<(?:a|div|span)\b[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/;
  for (const match of html.matchAll(blockRe)) {
    const block = match[1]!;
    const title = titleRe.exec(block);
    if (!title) continue;
    const url = unwrapResultUrl(title[1]!);
    if (!url) continue;
    const titleText = decodeHtmlText(title[2]!);
    if (!titleText) continue;
    const snippet = snippetRe.exec(block);
    results.push({
      title: titleText,
      url,
      snippet: snippet ? decodeHtmlText(snippet[1]!) : undefined,
    });
  }
  return results;
}

function isAnomalyResponse(html: string): boolean {
  return html.includes("anomaly-modal") || html.includes("anomaly.js");
}

export async function searchDuckDuckGo(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const form = new URLSearchParams({ q: query, kl: "us-en", b: "" });
  const response = await fetch(DUCKDUCKGO_HTML_URL, {
    method: "POST",
    body: form.toString(),
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": BROWSER_USER_AGENT,
      Referer: "https://html.duckduckgo.com/",
    },
    signal,
  });

  const body = await response.text();
  if (!response.ok && response.status !== 202) {
    throw new Error(`DuckDuckGo search failed (${response.status})`);
  }
  if (isAnomalyResponse(body)) {
    throw new Error(
      "DuckDuckGo blocked the request (bot detection). Try again later or use web_fetch with a known URL.",
    );
  }

  const seen = new Set<string>();
  const results: WebSearchResult[] = [];
  for (const result of parseHtmlResults(body)) {
    if (seen.has(result.url)) continue;
    seen.add(result.url);
    results.push(result);
    if (results.length >= limit) break;
  }
  return results;
}
