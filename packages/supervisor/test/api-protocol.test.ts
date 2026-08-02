import { describe, expect, it } from "vitest";
import { normalizeApiProtocol, requireApiProtocol, toPiApi } from "../src/config/api-protocol.js";

describe("api-protocol", () => {
  it("accepts canonical protocol names", () => {
    expect(normalizeApiProtocol("messages")).toBe("messages");
    expect(normalizeApiProtocol("chat-completions")).toBe("chat-completions");
    expect(normalizeApiProtocol("responses")).toBe("responses");
  });

  it("maps legacy provider api_type values", () => {
    expect(normalizeApiProtocol("anthropic-messages")).toBe("messages");
    expect(normalizeApiProtocol("openai-compatible")).toBe("chat-completions");
    expect(normalizeApiProtocol("openai-completions")).toBe("chat-completions");
    expect(normalizeApiProtocol("openai-responses")).toBe("responses");
  });

  it("rejects unknown values", () => {
    expect(normalizeApiProtocol("openai")).toBeUndefined();
    expect(() => requireApiProtocol("openai")).toThrow(/Unknown wire protocol/);
  });

  it("maps to pi-ai wire keys", () => {
    expect(toPiApi("messages")).toBe("anthropic-messages");
    expect(toPiApi("chat-completions")).toBe("openai-completions");
    expect(toPiApi("responses")).toBe("openai-responses");
  });
});
