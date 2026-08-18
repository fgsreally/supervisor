import { describe, expect, it } from "vitest";
import { loadPromptTemplate, renderPromptTemplate } from "../src/core/resource/system-prompts.js";

describe("supervisor: system-prompts", () => {
  it("loads the bundled prompt template", () => {
    expect(loadPromptTemplate("context-file-section")).toContain("# Context File");
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
