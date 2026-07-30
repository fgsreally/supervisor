import { describe, expect, it } from "vitest";
import {
  buildProjectRuntimeInstructions,
  extractPortPlaceholders,
  parseProjectRuntimeSpec,
} from "../src/core/project-runtime.js";

describe("project runtime parsing", () => {
  it("requires git, injectable ports, and an AGENTS.md initialization", () => {
    const prompt = buildProjectRuntimeInstructions({ name: "demo", cwd: "/tmp/demo" });

    expect(prompt).toContain("git init");
    expect(prompt).toContain("命令行参数或环境变量");
    expect(prompt).toContain("AGENTS.md");
    expect(prompt).toContain("逐字保留原内容");
    expect(prompt).toContain("不要自行 commit");
  });

  it("normalizes structured descriptions and scripts", () => {
    expect(
      parseProjectRuntimeSpec({
        description: "  一个项目  ",
        scripts: [
          { kind: "start", name: "web", command: " PORT=${PORT} pnpm dev " },
          { kind: "invalid", command: "ignored" },
        ],
      }),
    ).toEqual({
      description: "一个项目",
      scripts: [{ kind: "start", name: "web", command: "PORT=${PORT} pnpm dev" }],
    });
  });

  it("extracts unique cross-platform port placeholders", () => {
    expect(extractPortPlaceholders("A=$PORT B=${API_PORT} C=%PORT% D=${API_PORT}")).toEqual([
      "API_PORT",
      "PORT",
    ]);
  });
});
