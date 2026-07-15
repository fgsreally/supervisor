import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "../src/extension/index.js";
import { mcpExtension } from "../src/extension/index.js";

describe("builtin MCP extension", () => {
  it("does nothing when SQL access is unavailable", async () => {
    const prepare = vi.fn();
    await mcpExtension.setup({
      db: { available: false, prepare },
      agent: { id: 1 },
    } as unknown as ExtensionContext);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("looks up MCP bindings during extension activation", async () => {
    const all = vi.fn(() => []);
    const prepare = vi.fn(() => ({ all }));
    await mcpExtension.setup({
      db: { available: true, prepare },
      agent: { id: 7 },
    } as unknown as ExtensionContext);
    expect(prepare).toHaveBeenCalledOnce();
    expect(all).toHaveBeenCalledWith(7);
  });
});
