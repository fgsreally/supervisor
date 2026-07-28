import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import supervisorAdminExtension from "../src/extension/builtin/supervisor-admin/index.js";
import type { ToolDefinition } from "../src/extension/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function createContext(options?: { name?: string; approval?: "approve" | "reject" }) {
  const tools = new Map<string, ToolDefinition<any, unknown>>();
  const query = vi.fn(() => [{ id: 1, name: "Pi 助手" }]);
  const run = vi.fn(() => ({ changes: 1 }));
  const cwd = options?.name === "Other" ? process.cwd() : undefined;
  return {
    tools,
    query,
    run,
    context: {
      agent: {
        name: options?.name ?? "Pi 助手",
        registerTool: (tool: ToolDefinition<any, unknown>) => tools.set(tool.name, tool),
      },
      session: { signal: undefined },
      project: { cwd: cwd ?? process.cwd(), dir: cwd ?? process.cwd() },
      db: {
        available: true,
        query,
        prepare: () => ({ run }),
      },
      ui: {
        requestApproval: vi.fn(async () => ({ action: options?.approval ?? "approve" })),
      },
    } as never,
  };
}

describe("supervisor-admin extension", () => {
  it("only exposes management tools to the Pi assistant", async () => {
    const other = createContext({ name: "Other" });
    await supervisorAdminExtension.setup(other.context);
    expect(other.tools.size).toBe(0);

    const assistant = createContext();
    await supervisorAdminExtension.setup(assistant.context);
    expect([...assistant.tools.keys()]).toEqual([
      "supervisor_runtime_info",
      "supervisor_capabilities",
      "supervisor_http",
      "supervisor_db_query",
      "supervisor_db_write",
      "supervisor_scaffold_extension",
    ]);
  });

  it("discovers runtime facts, detailed HTTP parameters, and CLI arguments", async () => {
    const fixture = createContext();
    await supervisorAdminExtension.setup(fixture.context);

    const runtime = await fixture.tools.get("supervisor_runtime_info")!.execute({}, {} as never);
    expect(runtime.details).toEqual(
      expect.objectContaining({
        database: expect.objectContaining({ path: expect.any(String), source: expect.any(String) }),
        workspaceCwd: expect.any(String),
        argv: expect.any(Array),
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              paths: {
                "/extensions/install": {
                  post: { requestBody: { content: { "application/json": {} } } },
                },
              },
            }),
          ),
      ),
    );
    const capabilities = fixture.tools.get("supervisor_capabilities")!;
    const http = await capabilities.execute({ kind: "http", module: "extensions" }, {} as never);
    expect(http.details).toEqual(
      expect.objectContaining({
        source: "http://127.0.0.1:3030/openapi/json",
        paths: expect.objectContaining({ "/extensions/install": expect.any(Object) }),
      }),
    );

    const cli = await capabilities.execute({ kind: "cli", module: "extensions" }, {} as never);
    expect(cli.details).toContain("pi-supervisor extensions <action> [...args]");
  });

  it("allows reads and requires approval for direct writes", async () => {
    const fixture = createContext();
    await supervisorAdminExtension.setup(fixture.context);

    await fixture.tools
      .get("supervisor_db_query")!
      .execute({ sql: "SELECT id, name FROM agents", params: [] }, {} as never);
    expect(fixture.query).toHaveBeenCalledWith("SELECT id, name FROM agents", []);

    await fixture.tools.get("supervisor_db_write")!.execute(
      {
        sql: "UPDATE agents SET name = ? WHERE id = ?",
        params: ["Pi 助手", 1],
        reason: "rename",
      },
      {} as never,
    );
    expect(fixture.run).toHaveBeenCalledWith("Pi 助手", 1);

    const rejected = createContext({ approval: "reject" });
    await supervisorAdminExtension.setup(rejected.context);
    await expect(
      rejected.tools
        .get("supervisor_db_write")!
        .execute(
          { sql: "DELETE FROM agents WHERE id = ?", params: [1], reason: "remove" },
          {} as never,
        ),
    ).rejects.toThrow("rejected");
  });

  it("calls only the local Supervisor HTTP API", async () => {
    const fixture = createContext();
    await supervisorAdminExtension.setup(fixture.context);
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const http = fixture.tools.get("supervisor_http")!;

    await http.execute({ method: "GET", path: "/healthz" }, {} as never);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("http://127.0.0.1:3030/healthz");
  });

  it("creates a current extension scaffold without overwriting", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "supervisor-admin-"));
    tempDirs.push(cwd);
    const fixture = createContext();
    (fixture.context as any).project = { cwd, dir: cwd };
    await supervisorAdminExtension.setup(fixture.context);
    const scaffold = fixture.tools.get("supervisor_scaffold_extension")!;

    await scaffold.execute(
      { name: "demo-extension", targetDir: "extensions/demo-extension" },
      {} as never,
    );
    const entry = await readFile(join(cwd, "extensions/demo-extension/index.ts"), "utf8");
    expect(entry).toContain("ctx.agent.registerTool");
    await expect(
      scaffold.execute(
        { name: "demo-extension", targetDir: "extensions/demo-extension" },
        {} as never,
      ),
    ).rejects.toThrow("already exists");
  });
});
