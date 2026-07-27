import { describe, expect, it } from "vitest";
import {
  formatShadowRunPrompt,
  getShadowSystemPrompt,
  normalizeShadowSubmitResult,
} from "../src/extension/builtin/shadow/protocol.js";

describe("shadow Watson submit_result protocol", () => {
  it("normalizes every supported field", () => {
    const result = normalizeShadowSubmitResult({
      shadowMemory: { action: "append", content: "remember <this>" },
      message: "check the requirement",
      interrupt: true,
      status: "Fixing the payment callback; regression tests are still running.",
      suggestedQuestions: ["What should I test next?", "Can this be deployed safely?", ""],
      title: "Shadow redesign",
      commitMessage: "feat: checkpoint shadow redesign",
    });

    expect(result).toEqual({
      shadowMemory: { action: "append", content: "remember <this>" },
      message: "check the requirement",
      interrupt: true,
      status: "Fixing the payment callback; regression tests are still running.",
      suggestedQuestions: ["What should I test next?", "Can this be deployed safely?"],
      title: "Shadow redesign",
      commitMessage: "feat: checkpoint shadow redesign",
    });
  });

  it("accepts empty objects and JSON strings", () => {
    expect(normalizeShadowSubmitResult({})).toEqual({
      shadowMemory: undefined,
      message: undefined,
      interrupt: false,
      suggestedQuestions: undefined,
      status: undefined,
      title: undefined,
      commitMessage: undefined,
    });
    expect(normalizeShadowSubmitResult("")).toEqual({});
    expect(normalizeShadowSubmitResult('{"interrupt":false}')).toEqual({
      shadowMemory: undefined,
      message: undefined,
      interrupt: false,
      suggestedQuestions: undefined,
      status: undefined,
      title: undefined,
      commitMessage: undefined,
    });
  });

  it("rejects non-object payloads and only interrupts on true", () => {
    expect(normalizeShadowSubmitResult("nothing to report")).toBeNull();
    expect(normalizeShadowSubmitResult([])).toBeNull();
    expect(normalizeShadowSubmitResult({ interrupt: "true" })?.interrupt).toBe(false);
    expect(normalizeShadowSubmitResult({ interrupt: true })?.interrupt).toBe(true);
  });

  it("hardcodes Watson prompts and requires submit_result", () => {
    const system = getShadowSystemPrompt();
    expect(system).toContain("submit_result");
    expect(system).not.toContain("<shadow");
    expect(system).toContain("空对象");

    const prompt = formatShadowRunPrompt("memo", "[user] hi");
    expect(prompt).toContain("submit_result");
    expect(prompt).toContain("## Shadow memory");
    expect(prompt).toContain("memo");
    expect(prompt).toContain("[user] hi");
    expect(prompt).not.toContain("<shadow-memory");
  });
});
