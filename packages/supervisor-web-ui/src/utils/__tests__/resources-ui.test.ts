import { describe, expect, it } from "vitest";
import { layerFromApi } from "../resources-ui";

describe("resource UI mapping", () => {
  it("maps MCP configurations into JSON file resources", () => {
    const items = layerFromApi({
      skills: [],
      prompts: [],
      extensions: [],
      mcp: [
        {
          id: "local-tools",
          name: "Local tools",
          description: "Local MCP tools",
          filePath: "C:/resources/mcp/local-tools.json",
          content: '{"servers":{}}',
        },
      ],
    });

    expect(items).toEqual([
      expect.objectContaining({
        kind: "mcp",
        name: "Local tools",
        fileName: "local-tools.json",
        content: '{"servers":{}}',
      }),
    ]);
  });
});
