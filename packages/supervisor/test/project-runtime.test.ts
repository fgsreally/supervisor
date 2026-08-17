import { describe, expect, it } from "vitest";
import {
  buildProjectRuntimeInstructions,
  extractPortPlaceholders,
  parseProjectServicesMeta,
  parseProjectRuntimeSpec,
} from "../src/core/project-runtime.js";

describe("project runtime parsing", () => {
  it("requires git and AGENTS.md initialization only", () => {
    const prompt = buildProjectRuntimeInstructions({ name: "demo", cwd: "/tmp/demo" });

    expect(prompt).toContain("git init");
    expect(prompt).toContain("AGENTS.md");
    expect(prompt).toContain("本地开发服务");
    expect(prompt).toContain("start");
    expect(prompt).toContain("refactor it to match the project");
    expect(prompt).not.toContain("ProjectServiceRegister");
    expect(prompt).not.toContain("ProjectServiceApply");
    expect(prompt).not.toContain("UpdateService");
    expect(prompt).not.toContain('"scripts"');
  });

  it("normalizes structured description", () => {
    expect(
      parseProjectRuntimeSpec({
        description: "  一个项目  ",
        services: {
          installCommand: "pnpm install",
          definitions: [{ name: "web", startCommand: "pnpm dev --port ${PORT1}", path: "preview" }],
        },
      }),
    ).toEqual({
      description: "一个项目",
      services: {
        installCommand: "pnpm install",
        stopCommand: undefined,
        destroyCommand: undefined,
        definitions: [{ name: "web", startCommand: "pnpm dev --port ${PORT1}", path: "/preview" }],
      },
    });
  });

  it("rejects fixed ports and reads persisted project service definitions", () => {
    expect(() =>
      parseProjectRuntimeSpec({
        description: "demo",
        services: {
          definitions: [{ name: "web", startCommand: "vite --port 5173", path: "/" }],
        },
      }),
    ).toThrow("${PORT1}");

    expect(
      parseProjectServicesMeta({
        services: {
          status: "ready",
          definitions: [{ name: "web", startCommand: "vite --port ${PORT1}", path: "/" }],
          updatedAt: "2026-08-17T00:00:00.000Z",
        },
      })?.status,
    ).toBe("ready");
  });

  it("extracts unique cross-platform port placeholders", () => {
    expect(extractPortPlaceholders("A=$PORT B=${API_PORT} C=%PORT% D=${API_PORT}")).toEqual([
      "API_PORT",
      "PORT",
    ]);
  });
});
