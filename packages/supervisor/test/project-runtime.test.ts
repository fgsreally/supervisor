import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProjectRuntimeInstructions,
  ensureHtmlViews,
  extractPortPlaceholders,
  parseProjectServicesMeta,
  parseProjectRuntimeSpec,
} from "../src/core/project/project-runtime.js";
import { detectProjectSetup } from "../src/core/project-setup/index.js";

describe("project runtime parsing", () => {
  it("requires git and AGENTS.md initialization only", () => {
    const prompt = buildProjectRuntimeInstructions({ name: "demo", cwd: "/tmp/demo" });

    expect(prompt).toContain("git init");
    expect(prompt).toContain("as few rounds as possible");
    expect(prompt).toContain("project-root `.gitignore`");
    expect(prompt).toContain("AGENTS.md");
    expect(prompt).toContain("submit_result exactly once");
    expect(prompt).toContain("本地开发服务");
    expect(prompt).toContain("Start command");
    expect(prompt).toContain("preserve valid rules and improve it in place");
    expect(prompt).toContain(".supervisor");
    expect(prompt).toContain("Views are mandatory");
    expect(prompt).not.toContain("installCommand");
    expect(prompt).not.toContain("stopCommand");
    expect(prompt).not.toContain("destroyCommand");
    expect(prompt).not.toContain("CI, checks");
    expect(prompt).not.toContain("UpdateService");
  });

  it("normalizes structured description and ignores lifecycle commands", () => {
    expect(
      parseProjectRuntimeSpec({
        description: "  一个项目  ",
        services: {
          installCommand: "pnpm install",
          stopCommand: "taskkill /F /IM node.exe",
          definitions: [{ name: "web", startCommand: "pnpm dev --port ${PORT1}", path: "preview" }],
        },
      }),
    ).toEqual({
      description: "一个项目",
      services: {
        definitions: [{ name: "web", startCommand: "pnpm dev --port ${PORT1}", path: "/preview" }],
      },
    });
  });

  it("synthesizes views for uncovered root HTML entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "sv-detect-"));
    try {
      writeFileSync(join(dir, "index.html"), "<html></html>");
      writeFileSync(join(dir, "passcode.html"), "<html></html>");
      const spec = ensureHtmlViews(
        {
          description: "demo",
          services: {
            definitions: [{ name: "web", startCommand: "npx vite --port ${PORT1}" }],
            views: [{ name: "Home", service: "web", port: "PORT1", path: "/" }],
          },
        },
        dir,
      );
      expect(spec.services.views).toEqual([
        { name: "Home", service: "web", port: "PORT1", path: "/" },
        { name: "passcode", service: "web", port: "PORT1", path: "/passcode.html" },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects setup from lockfiles instead of the LLM", () => {
    const dir = mkdtempSync(join(tmpdir(), "sv-setup-"));
    try {
      writeFileSync(join(dir, "package.json"), "{}");
      writeFileSync(join(dir, "pnpm-lock.yaml"), "");
      expect(detectProjectSetup(dir)?.installCommand).toBe("pnpm install --frozen-lockfile");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects fixed ports and reads persisted project service definitions", () => {
    expect(() =>
      parseProjectRuntimeSpec({
        description: "demo",
        services: {
          definitions: [{ name: "web", startCommand: "vite --port 5173", path: "/" }],
        },
      }),
    ).toThrow('startCommand="vite --port 5173"；识别到的占位符=[]');

    expect(
      parseProjectServicesMeta({
        services: {
          definitions: [{ name: "web", startCommand: "vite --port ${PORT1}", path: "/" }],
          updatedAt: "2026-08-17T00:00:00.000Z",
        },
      }),
    ).not.toBeNull();
  });

  it("extracts unique cross-platform port placeholders", () => {
    expect(extractPortPlaceholders("A=$PORT B=${API_PORT} C=%PORT% D=${API_PORT}")).toEqual([
      "API_PORT",
      "PORT",
    ]);
  });
});
