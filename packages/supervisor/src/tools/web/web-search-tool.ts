import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { searchDuckDuckGo } from "./duckduckgo.js";

interface WebSearchParams {
  query: string;
  limit?: number;
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 8;
  return Math.min(20, Math.max(1, Math.floor(value)));
}

export function createWebSearchTool(): AgentTool {
  return {
    name: "web_search",
    label: "web_search",
    description:
      "Search the web for information. Returns short summaries with URLs — not full page content. " +
      "When a result looks relevant, call web_fetch on its URL to read the full page. " +
      "Cite sources inline as markdown links, e.g. [title](url).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default 8, max 20).",
        },
      },
      required: ["query"],
    },
    async execute(
      _toolCallId: string,
      params: WebSearchParams,
      signal?: AbortSignal,
    ): Promise<AgentToolResult> {
      const query = params.query?.trim();
      if (!query) {
        return {
          content: [{ type: "text", text: "Error: query is required." }],
          isError: true,
        };
      }

      try {
        const limit = clampLimit(params.limit);
        const results = await searchDuckDuckGo(query, limit, signal);
        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No search results found. Try rephrasing the query or use web_fetch with a known URL.",
              },
            ],
            details: { query, count: 0 },
          };
        }

        const lines: string[] = [
          `Search results for: ${query}`,
          "",
          "When you rely on a result, cite it inline as a markdown link, e.g. [title](url).",
          "Use web_fetch to read full page content.",
          "",
        ];

        for (let i = 0; i < results.length; i++) {
          const r = results[i]!;
          if (i > 0) lines.push("---", "");
          lines.push(`## ${r.title}`);
          lines.push(`URL: ${r.url}`);
          if (r.snippet) lines.push(`Snippet: ${r.snippet}`);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { query, count: results.length, results },
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `web_search failed: ${message}` }],
          isError: true,
        };
      }
    },
  };
}
