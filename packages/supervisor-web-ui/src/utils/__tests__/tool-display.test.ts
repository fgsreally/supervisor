import { describe, expect, it } from "vitest";
import { toolCallDetail, toolCallSummary, toolDetailLabel } from "../tool-display";

describe("skill tool display", () => {
  it("区分激活入口和访问附属资源", () => {
    expect(toolCallSummary("skill", { name: "review" })).toBe("激活技能 review");
    expect(toolCallSummary("skill", { name: "review", path: "references/typescript.md" })).toBe(
      "访问技能资源 review/references/typescript.md",
    );
  });

  it("展示 skill 调用参数", () => {
    expect(
      toolCallDetail("skill", {
        name: "review",
        path: "references/typescript.md",
        line_start: 10,
        line_end: 20,
      }),
    ).toContain("line_start: 10");
    expect(toolDetailLabel("skill")).toBe("技能内容");
  });
});
