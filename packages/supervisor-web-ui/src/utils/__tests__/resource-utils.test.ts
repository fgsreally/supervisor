import { describe, expect, it } from "vitest";
import { relativeSupervisorPath } from "../resource-utils";

describe("relativeSupervisorPath", () => {
  it("removes the Supervisor home prefix", () => {
    expect(relativeSupervisorPath("~/.pi/supervisor/global/skills/writer")).toBe("skills/writer");
    expect(relativeSupervisorPath("C:\\Users\\dev\\.pi\\supervisor\\global\\mcp\\local.json")).toBe(
      "mcp/local.json",
    );
  });

  it("keeps a global-relative suffix for custom roots", () => {
    expect(relativeSupervisorPath("D:/data/supervisor/global/prompts/review.md")).toBe(
      "prompts/review.md",
    );
  });
});
