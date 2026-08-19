import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatShadowRunPrompt,
  createShadowResultSchema,
  getShadowSystemPrompt,
  normalizeShadowSubmitResult,
  ShadowResultSchema,
} from "../src/extension/builtin/shadow/protocol.js";
import { Check } from "typebox/schema";
import { Type } from "typebox";

describe("shadow Watson submit_result protocol", () => {
  it("normalizes every supported field", () => {
    const result = normalizeShadowSubmitResult({
      shadowMemory: { action: "append", content: "remember <this>" },
      message: "The payment callback changed its behavior.",
      level: "info",
      suggestedQuestions: ["What should I test next?", "Can this be deployed safely?", ""],
      title: "Shadow redesign",
    });

    expect(result).toEqual({
      shadowMemory: { action: "append", content: "remember <this>" },
      message: "The payment callback changed its behavior.",
      level: "info",
      suggestedQuestions: ["What should I test next?", "Can this be deployed safely?"],
      title: "Shadow redesign",
      extensions: {},
    });
  });

  it("preserves extension fields only for info results", () => {
    const schema = createShadowResultSchema({
      commitMessage: Type.Optional(Type.String()),
    });

    expect(
      normalizeShadowSubmitResult(
        { message: "checkpoint ready", level: "info", commitMessage: "checkpoint" },
        schema,
        ["commitMessage"],
      ),
    ).toMatchObject({ level: "info", extensions: { commitMessage: "checkpoint" } });
    expect(
      normalizeShadowSubmitResult(
        { message: "be careful", level: "warning", commitMessage: "must not be here" },
        schema,
        ["commitMessage"],
      ),
    ).toBeNull();
  });

  it("accepts empty objects and JSON strings", () => {
    expect(normalizeShadowSubmitResult({})).toEqual({
      shadowMemory: undefined,
      message: undefined,
      level: undefined,
      suggestedQuestions: undefined,
      title: undefined,
      extensions: undefined,
    });
    expect(normalizeShadowSubmitResult("")).toEqual({});
    expect(
      normalizeShadowSubmitResult('{"message":"User-visible note","level":"info"}'),
    ).toMatchObject({
      message: "User-visible note",
      level: "info",
    });
  });

  it("requires a valid leveled message and rejects the old fields", () => {
    expect(Check(ShadowResultSchema, { message: "urgent", level: "error" })).toBe(true);
    expect(Check(ShadowResultSchema, { message: "careful", level: "warning" })).toBe(true);
    expect(Check(ShadowResultSchema, { message: "note", level: "info" })).toBe(true);
    expect(Check(ShadowResultSchema, { alert: "urgent" })).toBe(false);
    expect(Check(ShadowResultSchema, { analysis: "note" })).toBe(false);
    expect(Check(ShadowResultSchema, { message: "urgent", level: "invalid" })).toBe(false);
    expect(Check(ShadowResultSchema, { message: "urgent" })).toBe(false);
    expect(normalizeShadowSubmitResult({ message: "urgent", level: "error" })).toMatchObject({
      message: "urgent",
      level: "error",
    });
    expect(normalizeShadowSubmitResult({ message: "   ", level: "info" })).toMatchObject({
      message: undefined,
      level: "info",
    });
  });

  it("rejects non-object payloads", () => {
    expect(normalizeShadowSubmitResult("nothing to report")).toBeNull();
    expect(normalizeShadowSubmitResult([])).toBeNull();
  });

  it("loads English prompt resources and injects runtime context", () => {
    const system = getShadowSystemPrompt();
    expect(system).toContain("Shadow");
    expect(system).toContain("submit_result");
    expect(system).toContain("message");
    expect(system).toContain("error");
    expect(system).toContain("warning");
    expect(system).toContain("info");
    expect(system).not.toContain("alert");
    expect(system).not.toContain("analysis");

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
