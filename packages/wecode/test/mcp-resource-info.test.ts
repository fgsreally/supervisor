import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mcpResourcesToInfo } from "../src/agent/resource-resolver.js";
import type { Resource } from "../src/resources/types.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("MCP resource information", () => {
  it("exposes the stored JSON configuration to resource clients", () => {
    const root = join(tmpdir(), `mcp-resource-info-${Date.now()}`);
    roots.push(root);
    mkdirSync(root, { recursive: true });
    const filePath = join(root, "local-tools.json");
    const content = JSON.stringify({ servers: { local: { type: "stdio", command: "node" } } });
    writeFileSync(filePath, content);

    const resource: Resource = {
      id: 1,
      kind: "mcp",
      slug: "local-tools",
      name: "Local tools",
      description: null,
      sourcePath: filePath,
      version: null,
      meta: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(mcpResourcesToInfo([resource])).toEqual([
      {
        id: "local-tools",
        name: "Local tools",
        description: "MCP server configuration",
        filePath,
        content,
      },
    ]);
  });
});
