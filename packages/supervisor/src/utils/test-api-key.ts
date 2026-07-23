import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

export type ApiKeyProvider = "qwen" | "doubao" | "tavily" | "brave" | "serper" | "firecrawl";

function testWebSocket(url: string, headers: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers, handshakeTimeout: 12_000 });
    socket.once("open", () => {
      socket.close();
      resolve();
    });
    socket.once("error", reject);
  });
}

export async function testApiKey(
  provider: ApiKeyProvider,
  apiKey: string,
  options: { resourceId?: string } = {},
): Promise<void> {
  const signal = AbortSignal.timeout(12_000);
  let response: Response | undefined;
  switch (provider) {
    case "qwen":
      return testWebSocket(
        "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime",
        { Authorization: `Bearer ${apiKey}` },
      );
    case "doubao":
      return testWebSocket("wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async", {
        "X-Api-Key": apiKey,
        "X-Api-Resource-Id": options.resourceId || "volc.seedasr.sauc.duration",
        "X-Api-Connect-Id": randomUUID(),
      });
    case "tavily":
      response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "test", max_results: 1 }),
        signal,
      });
      break;
    case "brave":
      response = await fetch("https://api.search.brave.com/res/v1/web/search?q=test&count=1", {
        headers: { "X-Subscription-Token": apiKey },
        signal,
      });
      break;
    case "serper":
      response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: "test", num: 1 }),
        signal,
      });
      break;
    case "firecrawl":
      response = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "test", limit: 1, sources: ["web"] }),
        signal,
      });
      break;
  }
  if (!response.ok) throw new Error(`${provider} returned HTTP ${response.status}`);
}
