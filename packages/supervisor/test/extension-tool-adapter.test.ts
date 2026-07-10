import { describe, expect, it } from "vitest";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { wrapToolWithExtensionRuntime } from "../src/extension-system/tool-adapter.js";
import type { ExtensionRuntime } from "../src/extension-system/runtime.js";

describe("supervisor: extension tool adapter", () => {
  it("allows extension after_call handlers to replace tool results", async () => {
    const tool: AgentTool = {
      name: "bash",
      label: "bash",
      description: "test tool",
      parameters: { type: "object" },
      async execute() {
        return { content: [{ type: "text", text: "original" }] };
      },
    };
    const runtime = {
      async emit(event: { type: string; setResult?: (result: unknown) => void }) {
        if (event.type === "tool.after_call") {
          event.setResult?.({ content: [{ type: "text", text: "replaced" }] });
        }
      },
    } as ExtensionRuntime;

    const wrapped = wrapToolWithExtensionRuntime(tool, runtime);
    const result = await wrapped.execute("tool-call-1", {});

    expect(result.content).toEqual([{ type: "text", text: "replaced" }]);
  });
});
