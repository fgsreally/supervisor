import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  composeSessionSystemPrompt,
  isStoredSystemPromptSnapshot,
  sessionSystemPromptExtra,
} from "../src/core/session/session-system-prompt.js";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("supervisor: session system prompt compose", () => {
  it("treats context-file snapshots as stored snapshots, not spawn extra", () => {
    const snapshot = "You are coding.\n\n# Context File: /tmp/AGENTS.md\n\nrules";
    expect(isStoredSystemPromptSnapshot(snapshot)).toBe(true);
    expect(sessionSystemPromptExtra(snapshot)).toBe("");
    expect(sessionSystemPromptExtra("Only do the refactor.")).toBe("Only do the refactor.");
  });

  it("composes agent prompt, current AGENTS.md, and live services", () => {
    dir = join(tmpdir(), `supervisor-sysprompt-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "AGENTS.md"), "## 本地开发服务\n\n- start: pnpm dev\n");

    const composed = composeSessionSystemPrompt({
      extra: "You are coding.\n\n# Context File: /old/AGENTS.md\n\nstale",
      agentSystemMd: "You are the coding agent.",
      cwd: dir,
      services: {
        status: "active",
        startCommand: "pnpm dev",
        services: [{ name: "web", port: 4396, path: "/", startCommand: "pnpm dev" }],
      },
    });

    expect(composed).toContain("You are the coding agent.");
    expect(composed).toContain("## 本地开发服务");
    expect(composed).toContain("port 4396");
    expect(composed).toContain("UpdateService");
    expect(composed).toContain("SV_SESSION_DIR");
    expect(composed).toContain("@/path");
    expect(composed).not.toContain("/old/AGENTS.md");
    expect(composed).not.toContain("stale");
  });

  it("uses the session environment path for external agents", () => {
    const composed = composeSessionSystemPrompt({
      agentSystemMd: "Use @/attachments/input.csv.",
      cwd: tmpdir(),
      external: true,
    });

    expect(composed).toContain("${SV_SESSION_DIR}/attachments/input.csv");
    expect(composed).not.toContain("@/");
  });
});
