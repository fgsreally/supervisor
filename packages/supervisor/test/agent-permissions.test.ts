import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluateAgentPermission,
  permissionPathTarget,
  splitShellCommand,
  type AgentPermissionRules,
} from "../src/core/agent-permissions.js";
import { SessionRuntime } from "../src/core/session-runtime.js";

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

  it("treats project-root paths as project/** when cwd is a session worktree", () => {
    const project = makeRoot("worktree-project");
    const worktree = join(project, ".supervisor", "worktrees", "42");
    mkdirSync(worktree, { recursive: true });

    expect(permissionPathTarget(join(project, "package.json"), worktree)).toBe(
      "project/package.json",
    );
    expect(
      evaluateAgentPermission(
        { read: { "external/**": "ask" } },
        "read",
        { path: join(project, "package.json") },
        worktree,
      ).effect,
    ).toBe("allow");
  });

  it("uses explicit projectRoots even when cwd is unrelated", () => {
    const project = makeRoot("explicit-project");
    const other = makeRoot("other-cwd");
    expect(
      permissionPathTarget(join(project, "README.md"), other, [project]),
    ).toBe("project/README.md");
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

  it("evaluates every command in a shell chain and applies the decision to the whole call", () => {
    const rules: AgentPermissionRules = {
      bash: { "rm -rf *": "ask", "sudo *": "deny" },
    };
    const ask = evaluateAgentPermission(
      rules,
      "bash",
      { command: "cd build && rm -rf cache | tee result.log" },
      process.cwd(),
    );
    expect(ask).toMatchObject({
      effect: "ask",
      target: "cd build && rm -rf cache | tee result.log",
      matchedTarget: "rm -rf cache",
    });
    expect(
      evaluateAgentPermission(
        rules,
        "bash",
        { command: "rm -rf cache && sudo reboot" },
        process.cwd(),
      ).effect,
    ).toBe("deny");
  });

  it("does not split shell operators inside quotes or escapes", () => {
    expect(splitShellCommand('echo "a && b | c" && rm -rf cache')).toEqual([
      'echo "a && b | c"',
      "rm -rf cache",
    ]);
    expect(splitShellCommand("echo a\\|b; git status")).toEqual(["echo a\\|b", "git status"]);
  });

  it("allows calls that expose no string parameter to match", () => {
    const rules: AgentPermissionRules = { custom: { "*": "deny" } };
    expect(evaluateAgentPermission(rules, "custom", {}, process.cwd()).effect).toBe("allow");
  });

  it("enforces permissions without an extension or Project", async () => {
    const setTools = vi.fn(async () => {});
    const runtime = new SessionRuntime({
      session: { id: 7 } as never,
      harness: { subscribe: vi.fn(), setTools } as never,
      resource: {} as never,
      getSession: () => ({ id: 7, projectId: null }) as never,
      getMessages: async () => [],
    });
    runtime.configureAgentPermissions(
      { read: { "external/**": "deny" } },
      makeRoot("runtime"),
      vi.fn(),
    );
    await runtime.setTools([
      {
        name: "read",
        label: "read",
        description: "read",
        parameters: {} as never,
        execute: vi.fn(async () => ({ content: [{ type: "text" as const, text: "executed" }] })),
      },
    ]);

    const wrapped = setTools.mock.calls[0]?.[0][0];
    const result = await wrapped.execute("call-1", { path: join(tmpdir(), "outside.txt") });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual(
      expect.objectContaining({ type: "text", text: expect.stringContaining("permission denied") }),
    );
  });

  it("setTools only exposes active tools to the model", async () => {
    const harnessState: {
      tools: Map<string, { name: string }>;
      activeToolNames: string[];
    } = {
      tools: new Map(),
      activeToolNames: [],
    };
    const setTools = vi.fn(async (tools: Array<{ name: string }>, active?: string[]) => {
      harnessState.tools = new Map(tools.map((tool) => [tool.name, tool]));
      harnessState.activeToolNames = active ? [...active] : tools.map((tool) => tool.name);
    });
    const setActiveTools = vi.fn(async (names: string[]) => {
      harnessState.activeToolNames = [...names];
    });
    const runtime = new SessionRuntime({
      session: { id: 8 } as never,
      harness: {
        subscribe: vi.fn(),
        setTools,
        setActiveTools,
        get tools() {
          return harnessState.tools;
        },
        get activeToolNames() {
          return harnessState.activeToolNames;
        },
      } as never,
      resource: {} as never,
      getSession: () => ({ id: 8, projectId: null }) as never,
      getMessages: async () => [],
    });

    // Simulate extension registry: Setup inactive, Start active
    (
      runtime as unknown as {
        _extension: {
          services: {
            tools: {
              ensureRegistered(name: string, active?: boolean): void;
              filterActiveNames(names: string[]): string[];
              noteRegistered(name: string, active?: boolean): void;
              activate(names: string[]): void;
              deactivate(names: string[]): void;
            };
          };
        };
      }
    )._extension = {
      services: {
        tools: {
          _map: new Map<string, boolean>([
            ["bash", true],
            ["UpdateService", false],
            ["ProjectServiceStart", true],
          ]),
          ensureRegistered(name, active = true) {
            if (!this._map.has(name)) this._map.set(name, active);
          },
          noteRegistered(name, active = true) {
            this._map.set(name, active);
          },
          activate(names) {
            for (const name of names) this._map.set(name, true);
          },
          deactivate(names) {
            for (const name of names) this._map.set(name, false);
          },
          filterActiveNames(names) {
            return names.filter((name) => this._map.get(name) !== false);
          },
        },
      },
      wrapTools: (tools: unknown) => tools,
    } as never;

    await runtime.setTools([
      {
        name: "bash",
        label: "bash",
        description: "bash",
        parameters: {} as never,
        execute: vi.fn(),
      },
      {
        name: "UpdateService",
        label: "UpdateService",
        description: "update",
        parameters: {} as never,
        execute: vi.fn(),
      },
      {
        name: "ProjectServiceStart",
        label: "ProjectServiceStart",
        description: "start",
        parameters: {} as never,
        execute: vi.fn(),
      },
    ]);

    expect(setTools.mock.calls[0]?.[1]).toEqual(["bash", "ProjectServiceStart"]);
  });
});
