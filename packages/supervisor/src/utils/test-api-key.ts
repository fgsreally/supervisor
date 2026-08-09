import { WebSocket } from "ws";
import { formatUnknownError } from "./format-error.js";
import { buildDoubaoSpeechWsHeaders, resolveDoubaoSpeechPreset } from "./supervisor-settings.js";

export type ApiKeyProvider = "qwen" | "doubao" | "tavily" | "brave" | "serper" | "firecrawl";

function testWebSocket(url: string, headers: Record<string, string>, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const socket = new WebSocket(url, { headers, handshakeTimeout: 12_000 });

    socket.once("open", () => {
      finish(() => {
        socket.close();
        resolve();
      });
    });

    socket.on("unexpected-response", (_req, res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk as Buffer));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        let detail = raw;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { message?: string; error?: string; code?: number };
            detail = parsed.message ?? parsed.error ?? raw;
          } catch {
            detail = raw.slice(0, 240);
          }
        }
        finish(() =>
          reject(
            new Error(`${label}连接被拒绝 (HTTP ${res.statusCode})${detail ? `: ${detail}` : ""}`),
          ),
        );
      });
    });

    socket.once("error", (error) => {
      finish(() => reject(new Error(formatUnknownError(error, `${label}连接失败`))));
    });
  });
}

export type DoubaoSpeechCredentials = {
  appId: string;
  accessToken: string;
  preset?: string;
};

export async function testApiKey(
  provider: ApiKeyProvider,
  credential: string | DoubaoSpeechCredentials,
): Promise<void> {
  const apiKey = typeof credential === "string" ? credential : "";
  const signal = AbortSignal.timeout(12_000);
  let response: Response | undefined;
  switch (provider) {
    case "qwen":
      return testWebSocket(
        "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime",
        { Authorization: `Bearer ${typeof credential === "string" ? credential : ""}` },
        "DashScope 语音",
      );
    case "doubao": {
      const creds =
        typeof credential === "string" ? { appId: "", accessToken: credential } : credential;
      if (!creds.appId.trim() && !creds.accessToken.trim()) {
        throw new Error("App ID 与 Access Token 不能同时为空");
      }
      const preset = resolveDoubaoSpeechPreset(creds.preset);
      return testWebSocket(
        preset.wsUrl,
        buildDoubaoSpeechWsHeaders(creds.appId, creds.accessToken, preset.resourceId),
        "豆包语音",
      );
    }
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
  if (!response!.ok) throw new Error(`${provider} returned HTTP ${response!.status}`);
}
