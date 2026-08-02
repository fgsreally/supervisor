import { createServer, type IncomingMessage, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import {
  streamOpenAICompletions,
  streamOpenAIResponses,
  type Context,
  type Model,
} from "@earendil-works/pi-ai";

interface CapturedRequest {
  body: Record<string, unknown>;
  headers: IncomingMessage["headers"];
  url: string | undefined;
}

const context: Context = {
  systemPrompt: "Reply tersely.",
  messages: [{ role: "user", content: "ping", timestamp: 0 }],
};

function model(api: "openai-responses" | "openai-completions", baseUrl: string): Model {
  return {
    id: "gpt-test",
    name: "Protocol test model",
    api,
    provider: "protocol-test",
    baseUrl,
    reasoning: false,
    input: ["text"],
    contextWindow: 16_384,
    maxTokens: 1_024,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

function responseEvents(): string {
  return [
    'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_1"}}\n\n',
    'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"id":"msg_1","type":"message","role":"assistant","content":[]}}\n\n',
    'event: response.content_part.added\ndata: {"type":"response.content_part.added","part":{"type":"output_text","text":""}}\n\n',
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"pong"}\n\n',
    'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"id":"msg_1","type":"message","role":"assistant","content":[{"type":"output_text","text":"pong"}]}}\n\n',
    'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_1","status":"completed","usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}}\n\n',
  ].join("");
}

function completionEvents(): string {
  return [
    'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","created":0,"model":"gpt-test","choices":[{"index":0,"delta":{"role":"assistant","content":"pong"},"finish_reason":null}]}\n\n',
    'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","created":0,"model":"gpt-test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}\n\n',
    "data: [DONE]\n\n",
  ].join("");
}

describe("OpenAI fetch protocol selection", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      server.close();
      await once(server, "close");
      server = undefined;
    }
  });

  async function capture(kind: "responses" | "completions"): Promise<CapturedRequest> {
    let resolveRequest!: (request: CapturedRequest) => void;
    const request = new Promise<CapturedRequest>((resolve) => {
      resolveRequest = resolve;
    });
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      resolveRequest({
        url: req.url,
        headers: req.headers,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      });
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(kind === "responses" ? responseEvents() : completionEvents());
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;
    const stream =
      kind === "responses"
        ? streamOpenAIResponses(model("openai-responses", baseUrl), context, { apiKey: "test-key" })
        : streamOpenAICompletions(model("openai-completions", baseUrl), context, { apiKey: "test-key" });
    for await (const _event of stream) {
      // Consume the stream so the client finishes parsing the mocked SSE response.
    }
    return request;
  }

  it("sends the Responses API protocol to /responses", async () => {
    const request = await capture("responses");

    expect(request.url).toBe("/v1/responses");
    expect(request.headers.authorization).toBe("Bearer test-key");
    expect(request.body).toMatchObject({
      model: "gpt-test",
      stream: true,
      store: false,
      input: [
        { role: "system", content: "Reply tersely." },
        { role: "user", content: [{ type: "input_text", text: "ping" }] },
      ],
    });
    expect(request.body).not.toHaveProperty("messages");
  });

  it("sends the Chat Completions protocol to /chat/completions", async () => {
    const request = await capture("completions");

    expect(request.url).toBe("/v1/chat/completions");
    expect(request.headers.authorization).toBe("Bearer test-key");
    expect(request.body).toMatchObject({
      model: "gpt-test",
      stream: true,
      messages: [
        { role: "system", content: "Reply tersely." },
        { role: "user", content: "ping" },
      ],
      stream_options: { include_usage: true },
    });
    expect(request.body).not.toHaveProperty("input");
  });
});
