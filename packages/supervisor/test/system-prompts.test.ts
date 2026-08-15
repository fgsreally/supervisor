import { describe, expect, it } from "vitest";
import { getPackagedPromptsDir, renderPromptTemplate } from "../src/core/resource/system-prompts.js";

describe("supervisor: system-prompts", () => {
  it("resolves the packaged prompts directory", () => {
    expect(getPackagedPromptsDir()).toContain("prompts");
  });

  it("renders variable placeholders", () => {
    const rendered = renderPromptTemplate("context-file-section", {
      path: "/tmp/AGENTS.md",
      content: "hello",
    });
    expect(rendered).toContain("# Context File: /tmp/AGENTS.md");
    expect(rendered).toContain("hello");
  });
});
