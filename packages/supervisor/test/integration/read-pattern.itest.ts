/**
 * Integration test for the read_pattern extension tool.
 *
 * Runs a real minimax-powered agent via SessionManager.
 * Verifies that the built-in "read" tool is called to read file contents.
 */

import { afterAll, beforeAll, describe, expect } from "vitest";
import {
  createTestEnv,
  judgeWithTestLlm,
  writeTestFile,
  spawnSession,
  runPrompt,
  itIfProviderKey,
  type TestEnv,
} from "./helpers";

const TEST_CODE = [
  "/** A simple math utility module. */",
  "export function add(a: number, b: number): number {",
  "  return a + b;",
  "}",
  "",
  "export function multiply(a: number, b: number): number {",
  "  return a * b;",
  "}",
  "",
  "export class Counter {",
  "  private count = 0;",
  "  increment(): number {",
  "    this.count += 1;",
  "    return this.count;",
  "  }",
  "  getValue(): number {",
  "    return this.count;",
  "  }",
  "}",
].join("\n");

let env: TestEnv;

beforeAll(async () => {
  env = await createTestEnv();
  writeTestFile(env.root, "math.ts", TEST_CODE);
});

afterAll(() => {
  env.cleanup();
});

describe("read extension", () => {
  itIfProviderKey(
    "should read file content via the read tool",
    async () => {
      const session = await spawnSession(env, {
        systemPrompt:
          "You are a coding assistant. When asked to read a file, use the read tool with the path and appropriate parameters.",
      });

      const { messages, events } = await runPrompt(
        env,
        session.id,
        "Read the file math.ts in the current directory and tell me what functions and classes it contains.",
      );

      // Verify the read tool was called
      const readCalls = events.filter((e: any) => (e as any).toolName === "read");
      expect(readCalls.length).toBeGreaterThan(0);

      // Build a summary for the judge
      const summary = JSON.stringify({
        readToolCalls: readCalls.length,
        events: events
          .filter((e: any) => e.type === "tool_execution_start" || e.type === "tool_execution_end")
          .map((e: any) => ({ type: e.type, toolName: e.toolName })),
      });

      const judgePrompt =
        "Evaluate this test result.\n\n" +
        "## Expected behavior\n" +
        "The agent should call the 'read' tool to read math.ts, then correctly identify that the file contains: add() function, multiply() function, and a Counter class with increment() and getValue() methods.\n\n" +
        "## Test result summary\n" +
        summary +
        "\n\n## Agent messages\n" +
        JSON.stringify(messages, null, 2).slice(0, 8000);

      const judgeEnv = await createTestEnv();
      try {
        const verdict = await judgeWithTestLlm(judgeEnv, judgePrompt);
        expect(verdict.passed, verdict.raw).toBe(true);
      } finally {
        judgeEnv.cleanup();
      }
    },
    180_000,
  );
});
