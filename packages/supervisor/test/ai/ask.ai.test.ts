import { judgeAiResult, withAiTestEnvironment } from "@earendil-works/pi-supervisor/test";
import { describe, expect } from "vitest";
import { aiIt } from "./helpers.js";

describe("ask tool AI behavior", () => {
  aiIt("asks a useful multiple-choice question", async () => {
    await withAiTestEnvironment({}, async (environment) => {
      const result = await environment.run({
        name: "ask-multiple-choice",
        systemPrompt:
          "You are a coding assistant. Use the ask tool when user input is required to choose an approach.",
        prompt:
          "I need to choose Vue, React, or Svelte for a new project. Ask me one multiple-choice question with those three options and a short description for each.",
      });
      const judgment = await judgeAiResult({
        task: "Ask the user to choose Vue, React, or Svelte through the ask tool.",
        criteria: [
          "The ask tool is used",
          "The question contains Vue, React, and Svelte as distinct options",
          "Each option has a useful short description",
        ],
        result,
      });
      expect(judgment.verdict, judgment.raw).toBe("pass");
    });
  });
});
