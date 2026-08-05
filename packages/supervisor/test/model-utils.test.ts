import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SupervisorDb } from "../src/db/db.js";
import { resolveLLMConfig } from "../src/utils/model-utils.js";

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe("resolveLLMConfig", () => {
  it("builds the request configuration only from model and provider rows", () => {
    root = mkdtempSync(join(tmpdir(), "llm-config-"));
    const db = new SupervisorDb(join(root, "db.sqlite"));
    const providerId = db.insertProvider({
      slug: "custom-provider",
      name: "Custom Provider",
      protocol: "chat-completions",
      base_url: "https://llm.example.test/v1",
      api_key: "secret",
    });
    const model = db.insertModel({
      provider_id: providerId,
      model_id: "custom-model",
      name: "Custom Model",
      context_window: 64000,
      supports_vision: 1,
    });

    const config = resolveLLMConfig(model.id);

    expect(config.apiKey).toBe("secret");
    expect(config.model).toMatchObject({
      id: "custom-model",
      name: "Custom Model",
      provider: "custom-provider",
      api: "openai-completions",
      baseUrl: "https://llm.example.test/v1",
      contextWindow: 64000,
      input: ["text", "image"],
    });
    db.close();
  });
});
