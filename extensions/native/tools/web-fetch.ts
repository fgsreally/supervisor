import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { loadPiNativesBindings } from "../pi-natives-loader.js";
import { safeFetch } from "../utils/ssrf.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

const webFetchSchema = Type.Object({
  url: Type.String({ description: "The http(s) URL to fetch." }),
  format: Type.Optional(
    Type.Union([Type.Literal("text"), Type.Literal("markdown")], {
      description: "Output format for HTML pages (default: markdown).",
    }),
  ),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default 30, max 120)." })),
});

type WebFetchParams = {
  url: string;
  format?: "text" | "markdown";
  timeout?: number;
};

function clampTimeout(seconds: number | undefined): number {
  if (seconds === undefined || !Number.isFinite(seconds)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(1_000, Math.floor(seconds * 1000)));
}

export function createNativeWebFetchTool(): AgentTool {
  return {
    name: "web_fetch",
    label: "web_fetch",
    description:
      "Fetch content from a URL. HTML is converted to markdown via omp Rust htmlToMarkdown (pi-natives). " +
      "Does not execute JavaScript.",
    parameters: webFetchSchema,
    async execute(
      _toolCallId: string,
      params: WebFetchParams,
      signal?: AbortSignal,
    ): Promise<AgentToolResult> {
      const url = params.url?.trim();
      if (!url) {
        return { content: [{ type: "text", text: "Error: url is required." }], isError: true };
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

      try {
        const response = await safeFetch(url, {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml,text/plain,text/markdown;q=0.9,*/*;q=0.8",
            "User-Agent": DEFAULT_USER_AGENT,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          return {
            content: [{ type: "text", text: `HTTP ${response.status} ${response.statusText} for ${url}` }],
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

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_RESPONSE_BYTES) {
          return {
            content: [{ type: "text", text: `Response too large (>${MAX_RESPONSE_BYTES} bytes)` }],
            isError: true,
          };
        }

        const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
        const body = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
        let text: string;

        if (
          contentType.includes("text/plain") ||
          contentType.includes("text/markdown") ||
          contentType.includes("application/json")
        ) {
          text = body;
        } else if (contentType.includes("text/html") || body.trimStart().startsWith("<")) {
          const natives = loadPiNativesBindings();
          const useMarkdown = (params.format ?? "markdown") !== "text";
          text = useMarkdown
            ? await natives.htmlToMarkdown(body, { cleanContent: true, skipImages: false })
            : await natives.htmlToMarkdown(body, { cleanContent: true, skipImages: true });
          if (!text.trim()) {
            return {
              content: [
                {
                  type: "text",
                  text: "No readable text extracted. The page may require JavaScript — try the browser tool.",
                },
              ],
              isError: true,
            };
          }
        } else {
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
          details: {
            engine: "pi-natives",
            url,
            format: params.format ?? "markdown",
            bytes: buffer.byteLength,
          },
        };
      } catch (error: unknown) {
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
