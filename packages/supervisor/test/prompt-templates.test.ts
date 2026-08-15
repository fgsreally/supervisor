import { describe, expect, it } from "vitest";
import { expandPromptTemplate, type PromptTemplate } from "../src/core/resource/prompt-templates.js";

const template: PromptTemplate = {
  name: "answer",
  description: "Answer a question",
  argumentHint: "<topic> [style]",
  content: "first=$1; second=$2; all=$ARGUMENTS; tail=${@:2}; one=${@:1:1}",
  sourceInfo: {} as never,
  filePath: "/templates/answer.md",
};

describe("Template expansion", () => {
  it("replaces positional, aggregate, and sliced arguments", () => {
    expect(expandPromptTemplate('/answer "hello world" concise', [template])).toBe(
      "first=hello world; second=concise; all=hello world concise; tail=concise; one=hello world",
    );
  });

  it("leaves ordinary messages and unknown commands unchanged", () => {
    expect(expandPromptTemplate("hello", [template])).toBe("hello");
    expect(expandPromptTemplate("/unknown value", [template])).toBe("/unknown value");
  });
});
