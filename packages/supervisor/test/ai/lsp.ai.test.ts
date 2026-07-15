import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { judgeAiResult, withAiTestEnvironment } from "@earendil-works/pi-supervisor/test";
import { describe, expect } from "vitest";
import { aiIt } from "./helpers.js";

describe("LSP tool AI behavior", () => {
  aiIt("uses symbols to understand a TypeScript module", async () => {
    await withAiTestEnvironment({}, async (environment) => {
      writeFileSync(
        join(environment.cwd, "users.ts"),
        [
          "export interface User { id: number; name: string }",
          "export function createUser(name: string): User { return { id: Date.now(), name }; }",
          "export class UserService {",
          "  private users: User[] = [];",
          "  add(user: User): void { this.users.push(user); }",
          "}",
        ].join("\n"),
      );
      const result = await environment.run({
        name: "lsp-symbols",
        prompt:
          "Use the lsp tool's symbols action on users.ts, then summarize its interface, function, and class.",
      });
      const judgment = await judgeAiResult({
        task: "Use LSP symbols to describe users.ts.",
        criteria: [
          "The lsp tool is called with the symbols action",
          "The response identifies User, createUser, and UserService",
          "The summary agrees with the observed tool result",
        ],
        result,
      });
      expect(judgment.verdict, judgment.raw).toBe("pass");
    });
  });
});
