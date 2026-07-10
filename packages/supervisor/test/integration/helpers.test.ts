import { describe, expect, it } from "vitest";
import { normalizeYesNoJudgeAnswer } from "./helpers.js";

describe("integration helper judge parsing", () => {
  it("normalizes strict y/n judge answers", () => {
    expect(normalizeYesNoJudgeAnswer("y")).toBe("y");
    expect(normalizeYesNoJudgeAnswer("Yes\n")).toBe("y");
    expect(normalizeYesNoJudgeAnswer("```text\nn\n```")).toBe("n");
    expect(normalizeYesNoJudgeAnswer("no - failed")).toBe("n");
    expect(normalizeYesNoJudgeAnswer("maybe")).toBeNull();
  });
});
