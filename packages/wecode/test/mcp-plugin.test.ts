import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "../src/plugin/index.js";
import { mcpPlugin } from "../src/plugin/index.js";

describe("builtin MCP plugin", () => {
  it("does nothing when SQL access is unavailable", async () => {
    const prepare = vi.fn();
    await mcpPlugin.setup({
      db: { available: false, prepare },
      agent: { id: 1 },
    } as unknown as PluginContext);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("looks up MCP bindings during plugin activation", async () => {
    const all = vi.fn(() => []);
    const prepare = vi.fn(() => ({ all }));
    await mcpPlugin.setup({
      db: { available: true, prepare },
      agent: { id: 7 },
    } as unknown as PluginContext);
    expect(prepare).toHaveBeenCalledOnce();
    expect(all).toHaveBeenCalledWith(7);
  });
});
