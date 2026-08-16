import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatShadowRunPrompt,
  getShadowSystemPrompt,
  normalizeShadowSubmitResult,
  ShadowResultSchema,
} from "../src/extension/builtin/shadow/protocol.js";
import { Check } from "typebox/schema";

describe("shadow Watson submit_result protocol", () => {
  it("normalizes every supported field", () => {
    const result = normalizeShadowSubmitResult({
      shadowMemory: { action: "append", content: "remember <this>" },
      alert: "The payment callback is failing.",
      suggestedQuestions: ["What should I test next?", "Can this be deployed safely?", ""],
      title: "Shadow redesign",
      commitMessage: "feat: checkpoint shadow redesign",
    });

    expect(result).toEqual({
      shadowMemory: { action: "append", content: "remember <this>" },
      alert: "The payment callback is failing.",
      analysis: undefined,
      suggestedQuestions: ["What should I test next?", "Can this be deployed safely?"],
      title: "Shadow redesign",
      commitMessage: "feat: checkpoint shadow redesign",
    });
  });

  it("accepts empty objects and JSON strings", () => {
    expect(normalizeShadowSubmitResult({})).toEqual({
      shadowMemory: undefined,
      alert: undefined,
      analysis: undefined,
      suggestedQuestions: undefined,
      title: undefined,
      commitMessage: undefined,
    });
    expect(normalizeShadowSubmitResult("")).toEqual({});
    expect(normalizeShadowSubmitResult('{"analysis":"User-visible note"}')).toMatchObject({
      analysis: "User-visible note",
    });
  });

  it("enforces mutually exclusive alert and analysis fields", () => {
    expect(Check(ShadowResultSchema, { alert: "urgent" })).toBe(true);
    expect(Check(ShadowResultSchema, { analysis: "note" })).toBe(true);
    expect(Check(ShadowResultSchema, { alert: "urgent", analysis: "note" })).toBe(false);
    expect(normalizeShadowSubmitResult({ alert: "urgent", analysis: "note" })).toBeNull();
    expect(normalizeShadowSubmitResult({ alert: "   " })).toMatchObject({ alert: undefined });
  });

  it("rejects non-object payloads", () => {
    expect(normalizeShadowSubmitResult("nothing to report")).toBeNull();
    expect(normalizeShadowSubmitResult([])).toBeNull();
  });

  it("loads English prompt resources and injects runtime context", () => {
    const system = getShadowSystemPrompt();
    expect(system).toContain("Shadow");
    expect(system).toContain("submit_result");
    expect(system).toContain("alert");
    expect(system).toContain("analysis");

    const prompt = formatShadowRunPrompt("memo", "[user] hi");
    expect(prompt).toContain("## Shadow memory");
    expect(prompt).toContain("memo");
    expect(prompt).toContain("[user] hi");
    expect(prompt).not.toContain("{{shadowMemory}}");
  });

  it("injects AGENTS.md from the session working directory", () => {
    const cwd = mkdtempSync(join(tmpdir(), "supervisor-shadow-context-"));
    try {
      writeFileSync(join(cwd, "AGENTS.md"), "SHADOW_CONTEXT_MARKER", "utf8");

      const system = getShadowSystemPrompt(cwd);

      expect(system).toContain("SHADOW_CONTEXT_MARKER");
      expect(system).toContain(join(cwd, "AGENTS.md"));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
