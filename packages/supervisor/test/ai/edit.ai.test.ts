import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { judgeAiResult, withAiTestEnvironment } from "@earendil-works/pi-supervisor/test";
import { describe, expect } from "vitest";
import { aiIt } from "./helpers.js";

describe("edit tool AI behavior", () => {
  aiIt("implements the requested file change", async () => {
    await withAiTestEnvironment({}, async (environment) => {
      const file = join(environment.cwd, "greeting.ts");
      writeFileSync(
        file,
        "export function greet(name: string) { return `Hello ${name}`; }\n// TODO: add farewell\n",
      );
      const result = await environment.run({
        name: "edit-farewell",
        prompt:
          "Edit greeting.ts and replace the TODO with an exported farewell(name) function. Keep greet unchanged.",
      });
      result.finalText += `\n\nFinal file:\n${readFileSync(file, "utf8")}`;
      const judgment = await judgeAiResult({
        task: "Add an exported farewell(name) function without changing greet.",
        criteria: [
          "The file is actually modified",
          "farewell is exported and accepts a name",
          "The original greet function remains intact",
          "The resulting TypeScript is plausible and minimal",
        ],
        result,
      });
      expect(judgment.verdict, judgment.raw).toBe("pass");
    });
  });
});
