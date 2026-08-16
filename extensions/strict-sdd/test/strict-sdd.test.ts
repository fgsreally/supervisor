import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import extension from "../index.js";
import { WorkflowArtifacts } from "../artifacts.js";
import { STAGES } from "../stages.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "strict-sdd-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("strict-sdd extension", () => {
  it("defines the complete workflow including mockup and both execution routes", () => {
    expect(Object.keys(STAGES)).toEqual([
      "brainstorm",
      "design",
      "spec",
      "mockup",
      "planning",
      "test",
      "vertical",
      "implement",
      "archive",
    ]);
    expect(STAGES.spec.next).toEqual(["mockup"]);
    expect(STAGES.mockup.next).toEqual(["planning"]);
    expect(STAGES.planning.next).toEqual(["test", "vertical"]);
  });

  it("keeps artifacts inside the Session directory and persists execution progress", async () => {
    const artifacts = new WorkflowArtifacts(await tempDir());
    await artifacts.ensure();
    await expect(artifacts.write("../escape.md", "bad")).rejects.toThrow("escapes");
    await artifacts.write(
      "plan.json",
      JSON.stringify({
        changes: [
          {
            id: "change-01",
            title: "First",
            specPaths: ["specs/first/spec.md"],
            tasks: ["implement"],
            files: ["src/first.ts"],
            test: { command: "pnpm", args: ["test"] },
          },
        ],
      }),
    );
    const plan = await artifacts.readPlan();
    const state = await artifacts.readExecution(plan);
    state.route = "vertical";
    state.changes[0]!.status = "tests_written";
    await artifacts.writeExecution(state);
    expect(await artifacts.readExecution(plan)).toEqual(state);
  });

  it("never activates a workflow inside a child Session", async () => {
    const registerTool = vi.fn();
    let setupSession: ((session: unknown, reason: "create") => Promise<void>) | undefined;
    await extension.setup({
      agent: {
        on: (_event: string, handler: typeof setupSession) => {
          setupSession = handler;
        },
        registerTool,
      },
    } as never);
    await setupSession?.({ isChild: true }, "create");
    expect(registerTool).not.toHaveBeenCalled();
  });

  it("requires one HTML mockup for every capability", async () => {
    const sessionDir = await tempDir();
    await mkdir(join(sessionDir, "workflow", "specs", "auth"), { recursive: true });
    const artifacts = new WorkflowArtifacts(sessionDir);
    await artifacts.write("specs/auth/spec.md", "# Auth");

    const tools = new Map<string, { execute: (params: unknown) => Promise<unknown> }>();
    const handlers = new Map<string, (event: any) => Promise<void>>();
    let workflow = { stage: "mockup", status: "working" };
    let meta: Record<string, unknown> = {};
    let setupSession: ((session: unknown, reason: "create") => Promise<void>) | undefined;
    const session = {
      id: 1,
      dir: sessionDir,
      isChild: false,
      project: { cwd: sessionDir },
      inject: { reattach: vi.fn(), clear: vi.fn() },
      workflow: {
        get: async () => workflow,
        set: async (patch: Partial<typeof workflow>) => (workflow = { ...workflow, ...patch }),
      },
      meta: {
        get: async () => meta,
        patch: async (patch: Record<string, unknown>) => (meta = { ...meta, ...patch }),
      },
      tools: { activate: vi.fn(async () => {}), deactivate: vi.fn(async () => {}) },
      on: (type: string, handler: (event: any) => Promise<void>) => {
        handlers.set(type, handler);
      },
    };
    const context = {
      agent: {
        id: 1,
        on: (_event: string, handler: typeof setupSession) => {
          setupSession = handler;
        },
        registerTool: (tool: { name: string; execute: (params: unknown) => Promise<unknown> }) =>
          tools.set(tool.name, tool),
        listTools: () => [...tools].map(([name]) => ({ name })),
        findByRole: async () => [],
      },
      exec: vi.fn(),
      log: vi.fn(),
    };

    await extension.setup(context as never);
    await setupSession?.(session, "create");
    const complete = tools.get("workflow_complete_stage")!;
    await expect(complete.execute({})).rejects.toThrow("mockup.html");
    await artifacts.write("specs/auth/mockup.html", "<html></html>");
    await expect(complete.execute({})).resolves.toBeDefined();
    expect(meta).toEqual({ strictSdd: { status: "waiting_confirmation" } });
  });
});
