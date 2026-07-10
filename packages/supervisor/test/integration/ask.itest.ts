/**
 * Integration test for the ask extension tool.
 *
 * Runs a real minimax-powered agent via SessionManager.
 * Verifies that the ask tool is invoked by the agent.
 * Requires MINIMAX_CN_API_KEY to be set in the environment.
 */

import { afterAll, beforeAll, describe, expect } from "vitest";
import { createTestEnv, spawnSession, runPrompt, itIfProviderKey, type TestEnv } from "./helpers";

const ASK_PROMPT = `I need to decide which JavaScript framework to use for a new project.

Use the ask tool to ask me a multiple-choice question with three options: Vue, React, and Svelte.
Each option should have a short description.

I'll answer after you ask.`;

const EXPECTED_BEHAVIOR = `The agent should call the ask tool with a question containing three options: Vue, React, and Svelte.`;

let env: TestEnv;

beforeAll(async () => {
  env = await createTestEnv();
});

afterAll(() => {
  env.cleanup();
});

describe("ask extension", () => {
  itIfProviderKey(
    "should generate a multiple-choice question via ask tool",
    async () => {
      const session = await spawnSession(env, {
        systemPrompt:
          "You are a coding assistant. When the user asks you to use the ask tool, call it with a concise multiple-choice question.",
      });

      const { events } = await runPrompt(env, session.id, ASK_PROMPT);

      const askCalls = events.filter((e: any) => {
        if (e.type === "tool_execution_start") return e.toolName === "ask";
        if (e.type === "tool_execution_end") return e.toolName === "ask";
        return false;
      });
      expect(askCalls.length, EXPECTED_BEHAVIOR).toBeGreaterThan(0);
    },
    180_000,
  );
});
