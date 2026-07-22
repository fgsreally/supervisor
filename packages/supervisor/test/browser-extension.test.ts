import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { activatePackagedTool } from "../src/tools/catalog.js";

const originalWindowsHelper = process.env.PI_COMPUTER_USE_WINDOWS_HELPER_PATH;
let helperDirectory: string | undefined;

afterEach(() => {
  if (originalWindowsHelper === undefined) delete process.env.PI_COMPUTER_USE_WINDOWS_HELPER_PATH;
  else process.env.PI_COMPUTER_USE_WINDOWS_HELPER_PATH = originalWindowsHelper;
  if (helperDirectory) rmSync(helperDirectory, { recursive: true, force: true });
  helperDirectory = undefined;
});

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
    const parameters = activation.tools[0]?.parameters as {
      properties?: { action?: { enum?: string[] } };
    };
    expect(parameters.properties?.action?.enum).toContain("screenshot");
  });

  it("activates desktop recording", async () => {
    const activation = await activatePackagedTool("desktop-recording", {
      cwd: process.cwd(),
      sessionId: 1,
    });
    expect(activation.tools[0]?.name).toBe("desktop_recording");
    const parameters = activation.tools[0]?.parameters as {
      properties?: { action?: { enum?: string[] } };
    };
    expect(parameters.properties?.action?.enum).toContain("screenshot");
  });

  it("adapts pi-computer-use tools", async () => {
    if (process.platform === "win32") {
      helperDirectory = mkdtempSync(join(tmpdir(), "supervisor-computer-use-test-"));
      const helperPath = join(helperDirectory, "windows-bridge.exe");
      writeFileSync(helperPath, "");
      process.env.PI_COMPUTER_USE_WINDOWS_HELPER_PATH = helperPath;
    }
    const activation = await activatePackagedTool("computer-use", {
      cwd: process.cwd(),
      sessionId: 1,
    });
    expect(activation.tools.map((tool) => tool.name)).toContain("find_roots");
    expect(activation.tools.map((tool) => tool.name)).toContain("act_ui");
    await activation.cleanup?.();
  });
});
