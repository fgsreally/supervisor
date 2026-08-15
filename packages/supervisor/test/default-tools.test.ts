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
});
