import { describe, expect, it } from "vitest";
import {
  buildProjectRuntimeInstructions,
  extractPortPlaceholders,
  parseProjectRuntimeSpec,
} from "../src/core/project-runtime.js";

describe("project runtime parsing", () => {
  it("requires git and AGENTS.md initialization only", () => {
    const prompt = buildProjectRuntimeInstructions({ name: "demo", cwd: "/tmp/demo" });

    expect(prompt).toContain("git init");
    expect(prompt).toContain("AGENTS.md");
    expect(prompt).toContain("本地开发服务");
    expect(prompt).toContain("start");
    expect(prompt).toContain("重构整份内容");
    expect(prompt).not.toContain("逐字保留原内容");
    expect(prompt).not.toContain("ProjectServiceRegister");
    expect(prompt).not.toContain('"scripts"');
  });

  it("normalizes structured description", () => {
    expect(
      parseProjectRuntimeSpec({
        description: "  一个项目  ",
        scripts: [{ kind: "start", name: "web", command: "ignored" }],
      }),
    ).toEqual({
      description: "一个项目",
    });
  });

  it("extracts unique cross-platform port placeholders", () => {
    expect(extractPortPlaceholders("A=$PORT B=${API_PORT} C=%PORT% D=${API_PORT}")).toEqual([
      "API_PORT",
      "PORT",
    ]);
  });
});
