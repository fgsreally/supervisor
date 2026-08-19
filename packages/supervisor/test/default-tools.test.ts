import { describe, expect, it } from "vitest";
import { createDefaultTools } from "../src/utils/default-tools.js";

describe("supervisor: default tools", () => {
  it("exposes pi coding tools plus grep/find/ls for exploration", () => {
    const names = createDefaultTools(process.cwd(), "coding").map((tool) => tool.name);

    expect(names).toEqual(["read", "edit", "write", "grep", "find", "ls", "bash"]);
  });

  it("exposes read-only exploration tools without bash/edit/write", () => {
    const names = createDefaultTools(process.cwd(), "readonly").map((tool) => tool.name);

    expect(names).toEqual(["read", "grep", "find", "ls"]);
  });

  it("resolves @/ paths inside the session directory for read", async () => {
    let requestedPath = "";
    const tools = createDefaultTools(process.cwd(), "readonly", {
      projectId: 7,
      sessionId: 9,
      read: {
        operations: {
          access: async (path) => {
            requestedPath = path;
          },
          readFile: async () => Buffer.from("ok"),
        },
      },
    });
    const read = tools.find((tool) => tool.name === "read");
    expect(read).toBeDefined();

    await read!.execute("test", { path: "@/logs/session.log" });
    expect(requestedPath).toContain("projects");
    expect(requestedPath).toMatch(/[\\/]sessions[\\/]9[\\/]logs[\\/]session\.log$/);
  });

});
