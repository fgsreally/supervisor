import { describe, expect, it } from "vitest";
import { activatePackagedTool } from "../src/tools/catalog.js";

describe("packaged supervisor tools", () => {
  it("activates web tools", async () => {
    const activation = await activatePackagedTool("web", {
      cwd: process.cwd(),
      sessionId: 1,
    });
    expect(activation.tools.map((tool) => tool.name).sort()).toEqual(["web_fetch", "web_search"]);
  });

  it("activates browser tool", async () => {
    const activation = await activatePackagedTool("browser", {
      cwd: process.cwd(),
      sessionId: 1,
    });
    expect(activation.tools[0]?.name).toBe("browser");
  });

  it("activates desktop recording", async () => {
    const activation = await activatePackagedTool("desktop-recording", {
      cwd: process.cwd(),
      sessionId: 1,
    });
    expect(activation.tools[0]?.name).toBe("desktop_recording");
  });

  it("adapts pi-computer-use tools", async () => {
    const activation = await activatePackagedTool("computer-use", {
      cwd: process.cwd(),
      sessionId: 1,
    });
    expect(activation.tools.map((tool) => tool.name)).toContain("find_roots");
    expect(activation.tools.map((tool) => tool.name)).toContain("act_ui");
    await activation.cleanup?.();
  });
});
