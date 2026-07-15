import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { judgeAiResult, withAiTestEnvironment } from "@earendil-works/pi-supervisor/testing/ai";
import { describe, expect } from "vitest";
import { aiIt } from "./helpers.js";

describe("read tool AI behavior", () => {
  aiIt("reads and accurately explains a source file", async () => {
    await withAiTestEnvironment({}, async (environment) => {
      writeFileSync(
        join(environment.cwd, "math.ts"),
        [
          "export function add(a: number, b: number) { return a + b; }",
          "export function multiply(a: number, b: number) { return a * b; }",
          "export class Counter {",
          "  private value = 0;",
          "  increment() { return ++this.value; }",
          "  getValue() { return this.value; }",
          "}",
        ].join("\n"),
      );
      const result = await environment.run({
        name: "read-source",
        prompt: "Read math.ts and accurately explain every exported function and class method.",
      });
      const judgment = await judgeAiResult({
        task: "Read and explain all APIs in math.ts.",
        criteria: [
          "The read tool is used on math.ts",
          "The answer identifies add and multiply",
          "The answer identifies Counter.increment and Counter.getValue",
          "The answer does not invent APIs",
        ],
        result,
      });
      expect(judgment.verdict, judgment.raw).toBe("pass");
    });
  });
});
