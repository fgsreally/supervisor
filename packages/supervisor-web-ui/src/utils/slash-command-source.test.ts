import { describe, expect, it } from "vitest";
import { normalizeSlashCommandName, resolveSlashCommandSource } from "./slash-command-source";

describe("slash-command-source", () => {
  const catalog = {
    skills: [{ name: "review" }],
    prompts: [{ name: "summarize" }],
    commands: [
      { name: "mcp-search", source: "mcp" as const },
      { name: "deploy", source: "custom" as const },
    ],
  };

  it("normalizes command names", () => {
    expect(normalizeSlashCommandName("/review")).toBe("review");
    expect(normalizeSlashCommandName("/skill:review")).toBe("review");
  });

  it("resolves source from catalog", () => {
    expect(resolveSlashCommandSource("/review", catalog)).toBe("skill");
    expect(resolveSlashCommandSource("/summarize", catalog)).toBe("prompt");
    expect(resolveSlashCommandSource("/mcp-search", catalog)).toBe("mcp");
    expect(resolveSlashCommandSource("/deploy", catalog)).toBe("custom");
    expect(resolveSlashCommandSource("/skill:anything", catalog)).toBe("skill");
    expect(resolveSlashCommandSource("/unknown", catalog)).toBe("custom");
  });
});
