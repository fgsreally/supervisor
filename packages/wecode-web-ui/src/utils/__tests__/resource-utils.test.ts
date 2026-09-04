import { describe, expect, it } from "vitest";
import { relativeWecodePath } from "../resource-utils";

describe("relativeWecodePath", () => {
  it("removes the Wecode home prefix", () => {
    expect(relativeWecodePath("~/.pi/wecode/global/skills/writer")).toBe("skills/writer");
    expect(relativeWecodePath("C:\\Users\\dev\\.pi\\wecode\\global\\mcp\\local.json")).toBe(
      "mcp/local.json",
    );
  });

  it("keeps a global-relative suffix for custom roots", () => {
    expect(relativeWecodePath("D:/data/wecode/global/prompts/review.md")).toBe(
      "prompts/review.md",
    );
  });
});
