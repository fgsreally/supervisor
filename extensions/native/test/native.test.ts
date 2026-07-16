import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createNativeAstGrepTool } from "../tools/ast-grep.js";
import { createNativeBashTool } from "../tools/bash.js";
import { createNativeFindTool } from "../tools/find.js";
import { createNativeGrepTool } from "../tools/grep.js";
import { createNativeLsTool } from "../tools/ls.js";
import { createNativeReadTool } from "../tools/read.js";
import { createNativeWebFetchTool } from "../tools/web-fetch.js";
import { isPiNativesAvailable, loadPiNativesBindings } from "../pi-natives-loader.js";
import { buildMinimizerOptions } from "../utils/minimizer-options.js";

const extensionEntry = resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.ts");

function textContent(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

describe("@earendil-works/supervisor-native", () => {
  it("loads extension entry", async () => {
    const mod = await import(extensionEntry);
    expect(mod.default.name).toBe("supervisor-native");
  });

  it("exposes required pi-natives bindings", () => {
    if (!isPiNativesAvailable()) return;
    const bindings = loadPiNativesBindings();
    expect(typeof bindings.executeShell).toBe("function");
    expect(typeof bindings.grep).toBe("function");
    expect(typeof bindings.glob).toBe("function");
    expect(typeof bindings.summarizeCode).toBe("function");
    expect(typeof bindings.applyBashFixups).toBe("function");
    expect(typeof bindings.astGrep).toBe("function");
    expect(typeof bindings.astEdit).toBe("function");
    expect(typeof bindings.htmlToMarkdown).toBe("function");
    expect(typeof bindings.listWorkspace).toBe("function");
    expect(typeof bindings.invalidateFsScanCache).toBe("function");
  });

  it("builds minimizer options with enabled default", () => {
    const prev = process.env.OMP_MINIMIZER_ENABLED;
    delete process.env.OMP_MINIMIZER_ENABLED;
    expect(buildMinimizerOptions().enabled).toBe(true);
    if (prev !== undefined) process.env.OMP_MINIMIZER_ENABLED = prev;
  });

  it("executes bash through pi-natives when platform addon is available", async () => {
    if (!isPiNativesAvailable()) return;

    const tool = createNativeBashTool(process.cwd());
    const result = await tool.execute(
      "test-call",
      { command: "echo supervisor-native", intent: "verify rust shell bridge" },
      undefined,
      undefined,
    );

    expect(textContent(result)).toContain("supervisor-native");
    expect((result.details as { engine?: string }).engine).toBe("pi-natives");
  }, 30_000);

  it("requires bash intent parameter", async () => {
    if (!isPiNativesAvailable()) return;

    const tool = createNativeBashTool(process.cwd());
    await expect(
      tool.execute("test-call", { command: "echo x" }, undefined, undefined),
    ).rejects.toThrow(/intent/i);
  });

  it("finds files via native glob", async () => {
    if (!isPiNativesAvailable()) return;

    const tool = createNativeFindTool(process.cwd());
    const result = await tool.execute(
      "test-call",
      { pattern: "package.json", path: "." },
      undefined,
      undefined,
    );

    expect(textContent(result)).toContain("package.json");
    expect((result.details as { engine?: string }).engine).toBe("pi-natives");
  }, 30_000);

  it("greps workspace via native grep", async () => {
    if (!isPiNativesAvailable()) return;

    const tool = createNativeGrepTool(process.cwd());
    const result = await tool.execute(
      "test-call",
      { pattern: "supervisor-native", path: ".", literal: true },
      undefined,
      undefined,
    );

    expect(textContent(result)).toMatch(/supervisor-native/);
    expect((result.details as { engine?: string }).engine).toBe("pi-natives");
  }, 30_000);

  it("lists directory via native listWorkspace", async () => {
    if (!isPiNativesAvailable()) return;

    const tool = createNativeLsTool(process.cwd());
    const result = await tool.execute("test-call", { path: "." }, undefined, undefined);

    expect(textContent(result)).toMatch(/package\.json|tools|index\.ts/);
    expect((result.details as { engine?: string }).engine).toBe("pi-natives");
  }, 30_000);

  it("read tool supports summarize path", () => {
    const tool = createNativeReadTool(process.cwd());
    expect(tool.name).toBe("read");
    expect(tool.description).toContain("summary");
  });

  it("ast_grep tool is registered", () => {
    const tool = createNativeAstGrepTool(process.cwd());
    expect(tool.name).toBe("ast_grep");
  });

  it("web_fetch tool is registered", () => {
    const tool = createNativeWebFetchTool();
    expect(tool.name).toBe("web_fetch");
  });
});
