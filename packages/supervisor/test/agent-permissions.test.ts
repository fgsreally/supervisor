import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateAgentPermission,
  permissionPathTarget,
  type AgentPermissionRules,
} from "../src/core/agent-permissions.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeRoot(name: string): string {
  const root = join(tmpdir(), `supervisor-permission-${name}-${Date.now()}-${Math.random()}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

describe("agent permission rules", () => {
  it("maps paths to project/** and external/** targets", () => {
    const project = makeRoot("project");
    const external = makeRoot("external");

    expect(permissionPathTarget(join(project, "src", "a.ts"), project)).toBe("project/src/a.ts");
    expect(permissionPathTarget(join(external, "a.ts"), project)).toMatch(/^external\/.+\/a\.ts$/);
  });

  it("allows unmatched arguments and asks for matching arguments", () => {
    const project = makeRoot("match");
    const rules: AgentPermissionRules = { read: { "external/**": "ask" } };

    expect(evaluateAgentPermission(rules, "read", { path: "src/a.ts" }, project).effect).toBe(
      "allow",
    );
    expect(
      evaluateAgentPermission(rules, "read", { path: join(tmpdir(), "outside.txt") }, project)
        .effect,
    ).toBe("ask");
  });

  it("applies deny before ask regardless of rule order", () => {
    const project = makeRoot("precedence");
    const rules: AgentPermissionRules = {
      read: { "project/**": "ask", "**/.env": "deny" },
    };

    expect(evaluateAgentPermission(rules, "read", { path: ".env" }, project).effect).toBe("deny");
  });

  it("matches dangerous bash command arguments", () => {
    const rules: AgentPermissionRules = { bash: { "rm -rf *": "ask" } };
    expect(
      evaluateAgentPermission(rules, "bash", { command: "rm -rf build" }, process.cwd()).effect,
    ).toBe("ask");
  });

  it("allows calls that expose no string parameter to match", () => {
    const rules: AgentPermissionRules = { custom: { "*": "deny" } };
    expect(evaluateAgentPermission(rules, "custom", {}, process.cwd()).effect).toBe("allow");
  });
});
