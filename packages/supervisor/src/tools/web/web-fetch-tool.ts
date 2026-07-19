import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { resolveApiKey } from "./credentials.js";
import { scrapeFirecrawl } from "./firecrawl.js";
import { htmlToText } from "./html.js";
import { safeFetch } from "./ssrf.js";
import { extractTavily } from "./tavily.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

interface WebFetchParams {
  url: string;
  format?: "text" | "markdown";
  timeout?: number;
}

function clampTimeout(seconds: number | undefined): number {
  if (seconds === undefined || !Number.isFinite(seconds)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(1_000, Math.floor(seconds * 1000)));
}

export function createWebFetchTool(options?: {
  provider?: "native" | "tavily" | "firecrawl" | "native-then-tavily" | "native-then-firecrawl";
  tavilyApiKeyEnv?: string;
  firecrawlApiKeyEnv?: string;
  tavilyApiKeyEncrypted?: string;
  firecrawlApiKeyEncrypted?: string;
}): AgentTool {
  return {
    name: "web_fetch",
    label: "web_fetch",
    description:
      "Fetch content from a known URL. Use after web_search to read full pages, or when you already have a URL. " +
      "Returns text or markdown extracted from HTML. Does not execute JavaScript — for JS-rendered pages use the browser tool. " +
      "Cite the source URL when using fetched content in your answer.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The http(s) URL to fetch.",
        },
        format: {
          type: "string",
          enum: ["text", "markdown"],
          description: "Output format. Both convert HTML to plain text (default: markdown).",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default 30, max 120).",
        },
      },
      required: ["url"],
    },
    async execute(
      _toolCallId: string,
      params: WebFetchParams,
      signal?: AbortSignal,
    ): Promise<AgentToolResult> {
      const url = params.url?.trim();
      if (!url) {
        return {
          content: [{ type: "text", text: "Error: url is required." }],
          isError: true,
        };
      }
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return {
          content: [{ type: "text", text: "Error: URL must start with http:// or https://" }],
          isError: true,
        };
      }

      const timeoutMs = clampTimeout(params.timeout);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      let attemptedFallback = false;

      try {
        const provider = options?.provider ?? "native";
        const enhancedProvider = provider.endsWith("firecrawl") ? "firecrawl" : "tavily";
        const extractEnhanced = async (): Promise<string> =>
          enhancedProvider === "firecrawl"
            ? scrapeFirecrawl(
                url,
                resolveApiKey(
                  "Firecrawl",
                  options?.firecrawlApiKeyEnv ?? "FIRECRAWL_API_KEY",
                  options?.firecrawlApiKeyEncrypted,
                ),
                controller.signal,
              )
            : extractTavily(
                url,
                options?.tavilyApiKeyEnv ?? "TAVILY_API_KEY",
                options?.tavilyApiKeyEncrypted,
                controller.signal,
              );
        const enhancedFallback = async (): Promise<AgentToolResult | undefined> => {
          if (!provider.startsWith("native-then-")) return undefined;
          attemptedFallback = true;
          const text = await extractEnhanced();
          return {
            content: [{ type: "text", text: `Source: ${url}\n\n${text}` }],
            details: { url, provider: enhancedProvider, fallback: true },
          };
        };
        if (provider === "tavily" || provider === "firecrawl") {
          const text = await extractEnhanced();
          return {
            content: [{ type: "text", text: `Source: ${url}\n\n${text}` }],
            details: { url, provider },
          };
        }
        const response = await safeFetch(url, {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml,text/plain,text/markdown;q=0.9,*/*;q=0.8",
            "User-Agent": DEFAULT_USER_AGENT,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const fallback = await enhancedFallback();
          if (fallback) return fallback;
          return {
            content: [
              { type: "text", text: `HTTP ${response.status} ${response.statusText} for ${url}` },
            ],
            isError: true,
          };
        }

        const contentLength = response.headers.get("content-length");
        if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
          return {
            content: [{ type: "text", text: `Response too large (>${MAX_RESPONSE_BYTES} bytes)` }],
            isError: true,
          };
        }

        const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_RESPONSE_BYTES) {
          return {
            content: [{ type: "text", text: `Response too large (>${MAX_RESPONSE_BYTES} bytes)` }],
            isError: true,
          };
        }

        const body = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
        let text: string;
        if (
          contentType.includes("text/plain") ||
          contentType.includes("text/markdown") ||
          contentType.includes("application/json")
        ) {
          text = body;
        } else if (contentType.includes("text/html") || body.trimStart().startsWith("<")) {
          text = htmlToText(body);
          if (!text.trim()) {
            const fallback = await enhancedFallback();
            if (fallback) return fallback;
            return {
              content: [
                {
                  type: "text",
                  text: "No readable text extracted. The page may require JavaScript to render — try the browser tool.",
                },
              ],
              isError: true,
            };
          }
        } else {
          const fallback = await enhancedFallback();
          if (fallback) return fallback;
          return {
            content: [
              {
                type: "text",
                text: `Unsupported content type: ${contentType || "unknown"}. Only text/html and text/plain are supported.`,
              },
            ],
            isError: true,
          };
        }

        const header = `Source: ${url}\n\nWhen you use this content, cite [source](${url}).\n\n`;
        return {
          content: [{ type: "text", text: header + text }],
          details: { url, format: params.format ?? "markdown", bytes: buffer.byteLength },
        };
      } catch (error: unknown) {
        if (
          (options?.provider ?? "native").startsWith("native-then-") &&
          !attemptedFallback &&
          !controller.signal.aborted
        ) {
          try {
            const fallbackProvider = (options?.provider ?? "").endsWith("firecrawl")
              ? "firecrawl"
              : "tavily";
            const text =
              fallbackProvider === "firecrawl"
                ? await scrapeFirecrawl(
                    url,
                    resolveApiKey(
                      "Firecrawl",
                      options?.firecrawlApiKeyEnv ?? "FIRECRAWL_API_KEY",
                      options?.firecrawlApiKeyEncrypted,
                    ),
                    controller.signal,
                  )
                : await extractTavily(
                    url,
                    options?.tavilyApiKeyEnv ?? "TAVILY_API_KEY",
                    options?.tavilyApiKeyEncrypted,
                    controller.signal,
                  );
            return {
              content: [{ type: "text", text: `Source: ${url}\n\n${text}` }],
              details: { url, provider: fallbackProvider, fallback: true },
            };
          } catch {
            // Preserve the native error below; it is usually more actionable.
          }
        }
        const message = error instanceof Error ? error.message : String(error);
        const isAbort = error instanceof Error && error.name === "AbortError";
        return {
          content: [
            {
              type: "text",
              text: isAbort
                ? `web_fetch timed out after ${timeoutMs / 1000}s`
                : `web_fetch failed: ${message}`,
            },
          ],
          isError: true,
        };
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
