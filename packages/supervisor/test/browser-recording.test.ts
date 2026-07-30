import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserTool } from "../src/tools/browser/tool.js";
import type { BrowserSession } from "../src/tools/browser/registry.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

function actionEnum(tool: ReturnType<typeof createBrowserTool>["tool"]): string[] {
  const parameters = tool.parameters as { properties: { action: { enum: string[] } } };
  return parameters.properties.action.enum;
}

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "supervisor-browser-recording-"));
  directories.push(directory);
  const actionsDisposable = { dispose: vi.fn(async () => {}) };
  const overlayDisposable = { dispose: vi.fn(async () => {}) };
  const screencast = {
    start: vi.fn(async () => actionsDisposable),
    stop: vi.fn(async () => {}),
    showActions: vi.fn(async () => actionsDisposable),
    hideActions: vi.fn(async () => {}),
    showChapter: vi.fn(async () => {}),
    showOverlay: vi.fn(async () => overlayDisposable),
    hideOverlays: vi.fn(async () => {}),
  };
  const page = {
    screencast,
    title: vi.fn(async () => "Test"),
    url: vi.fn(() => "about:blank"),
    isClosed: vi.fn(() => false),
  };
  const session: BrowserSession = {
    openTab: vi.fn(async (name) => ({ name, page: page as never })),
    getTab: vi.fn(() => ({ name: "main", page: page as never })),
    closeTab: vi.fn(async () => {}),
    closeAll: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
  const created = createBrowserTool({ sessionDir: directory, browserSession: session });
  const execute = (params: Record<string, unknown>) =>
    created.tool.execute("call", params as never) as Promise<unknown>;
  return { ...created, directory, execute, screencast };
}

describe("browser recording", () => {
  it("switches to recording actions and restores start after complete", async () => {
    const { tool, execute, directory, screencast } = await setup();
    const path = join(directory, "complete.webm");

    await execute({ action: "start", path });
    expect(actionEnum(tool)).not.toContain("start");
    expect(actionEnum(tool)).toEqual(
      expect.arrayContaining(["show_actions", "chapter", "overlay", "complete", "abort"]),
    );

    await execute({ action: "show_actions", cursor: "pointer" });
    await execute({ action: "chapter", title: "Checkout" });
    await execute({ action: "overlay", html: "<strong>Done</strong>" });
    await execute({ action: "complete" });

    expect(screencast.showActions).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "pointer" }),
    );
    expect(screencast.stop).toHaveBeenCalledOnce();
    expect(actionEnum(tool)).toContain("start");
  });

  it("deletes an unfinished artifact and restores start after abort", async () => {
    const { tool, execute, directory } = await setup();
    const path = join(directory, "abort.webm");
    await writeFile(path, "unfinished");

    await execute({ action: "start", path });
    await execute({ action: "abort" });

    await expect(access(path)).rejects.toThrow();
    expect(actionEnum(tool)).toContain("start");
  });
});
