/**
 * Integration test for the lsp extension tool.
 *
 * Runs a real minimax-powered agent via SessionManager.
 * Verifies that the lsp tool is called to list symbols.
 * Requires MINIMAX_CN_API_KEY to be set in the environment.
 */

import { afterAll, beforeAll, describe, expect } from "vitest";
import {
  createTestEnv,
  spawnSession,
  runPrompt,
  writeTestFile,
  itIfProviderKey,
  type TestEnv,
} from "./helpers";

const TEST_CODE = `/**
 * User management module
 */

export interface User {
  id: number;
  name: string;
  email: string;
}

export function createUser(name: string, email: string): User {
  return { id: Date.now(), name, email };
}

export class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  getUser(id: number): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  getAllUsers(): User[] {
    return this.users;
  }
}

const defaultUser: User = { id: 0, name: "Default", email: "default@example.com" };
`;

const LSP_PROMPT =
  "List all the symbols (functions, classes, interfaces) defined in test-lsp.ts. Use the lsp tool's symbols action.";

const EXPECTED_BEHAVIOR =
  "The agent should call the lsp tool with action='symbols' on test-lsp.ts.";

let env: TestEnv;

beforeAll(async () => {
  env = await createTestEnv();
  writeTestFile(env.root, "test-lsp.ts", TEST_CODE);
});

afterAll(() => {
  env.cleanup();
});

describe("lsp extension", () => {
  itIfProviderKey(
    "should list symbols via lsp tool",
    async () => {
      const session = await spawnSession(env, {
        systemPrompt:
          "You are a coding assistant. When asked to list symbols, use the lsp tool with the appropriate action.",
      });

      const { events } = await runPrompt(env, session.id, LSP_PROMPT);

      const lspCalls = events.filter((e: any) => {
        if (e.type === "tool_execution_start") return e.toolName === "lsp";
        return false;
      });
      expect(lspCalls.length, EXPECTED_BEHAVIOR).toBeGreaterThan(0);
    },
    180_000,
  );
});
