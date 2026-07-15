import {
  parseAiComparisonResult,
  parseAiJudgeResult,
  readAiSubjectConfig,
} from "@earendil-works/pi-supervisor/test";
import { describe, expect, it } from "vitest";

describe("public AI testing API", () => {
  it("parses a structured judge result", () => {
    expect(
      parseAiJudgeResult('{"score":3,"reasons":["works"],"evidence":["tests pass"]}'),
    ).toMatchObject({ verdict: "pass", score: 3, reasons: ["works"] });
    expect(parseAiJudgeResult("not json").verdict).toBe("invalid");
  });

  it("parses a structured comparison", () => {
    expect(
      parseAiComparisonResult(
        '{"winner":"candidate","baselineScore":2,"candidateScore":4,"reasons":[],"evidence":[]}',
      ),
    ).toMatchObject({ winner: "candidate", baselineScore: 2, candidateScore: 4 });
  });

  it("accepts explicit subject configuration", () => {
    expect(readAiSubjectConfig({ provider: "demo", model: "demo-model" })).toMatchObject({
      provider: "demo",
      model: "demo-model",
    });
  });
});
