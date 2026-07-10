/**
 * Integration test for the edit extension tool.
 *
 * Runs a real minimax-powered agent via SessionManager.
 * Verifies that the edit tool is called and the file is modified.
 * Requires MINIMAX_CN_API_KEY to be set in the environment.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect } from "vitest";
import {
  createTestEnv,
  spawnSession,
  runPrompt,
  writeTestFile,
  itIfProviderKey,
  type TestEnv,
} from "./helpers";

const ORIGINAL_CODE = `function greet(name: string): string {
  return "Hello, " + name;
}

const message = greet("World");
console.log(message);

// TODO: add farewell function
`;

const EDIT_PROMPT = `Edit the file test-edit.ts: replace the TODO comment "// TODO: add farewell function" with an actual farewell function definition.`;

const EXPECTED_BEHAVIOR =
  "The agent should call the edit tool to modify test-edit.ts, replacing the TODO comment with a farewell function.";

let env: TestEnv;
let filePath: string;

beforeAll(async () => {
  env = await createTestEnv();
  filePath = writeTestFile(env.root, "test-edit.ts", ORIGINAL_CODE);
});

afterAll(() => {
  env.cleanup();
});

describe("edit extension", () => {
  itIfProviderKey(
    "should edit file content via edit tool",
    async () => {
      const session = await spawnSession(env, {
        systemPrompt:
          "You are a coding assistant. When asked to edit a file, use the edit tool with the appropriate parameters.",
      });

      const { events } = await runPrompt(env, session.id, EDIT_PROMPT);

      const editCalls = events.filter((e: any) => {
        if (e.type === "tool_execution_start") return e.toolName === "edit";
        return false;
      });
      expect(editCalls.length, EXPECTED_BEHAVIOR).toBeGreaterThan(0);

      const fileContent = readFileSync(filePath, "utf-8");
      expect(fileContent).toContain("farewell");
    },
    180_000,
  );
});
