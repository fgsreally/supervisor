import { describe, expect, it, vi } from "vitest";
import type { TSchema } from "typebox";
import type { AgentResource } from "../src/agent/runtime-resources.js";
import { createSkillExtension } from "../src/extension/index.js";
import type { ExtensionContext, ToolDefinition } from "../src/extension/types.js";

describe("skill extension", () => {
  it("通过扩展注册 skill 工具并转发资源操作", async () => {
    let registered: ToolDefinition<TSchema, unknown> | undefined;
    const executeSkillTool = vi.fn(() => ({
      text: "2: details",
      details: {
        name: "review",
        operation: "read" as const,
        path: "references/details.md",
        baseDir: "/skills/review",
      },
    }));
    const resource = {
      hasSkills: () => true,
      executeSkillTool,
    } as unknown as AgentResource;
    const context = {
      agent: {
        registerTool(tool: ToolDefinition<TSchema, unknown>) {
          registered = tool;
        },
      },
    } as unknown as ExtensionContext;

    await createSkillExtension(resource).setup(context);

    expect(registered?.name).toBe("skill");
    const params = { name: "review", path: "references/details.md", line_start: 2 };
    const result = await registered!.execute(params, {
      toolCallId: "call-1",
      session: { id: "1", cwd: "/workspace" },
      reportProgress: () => {},
    });
    expect(executeSkillTool).toHaveBeenCalledWith(params);
    expect(result.content).toEqual([{ type: "text", text: "2: details" }]);
    expect(result.details).toMatchObject({ operation: "read" });
  });

  it("没有任何 skill 时不注册工具", async () => {
    const registerTool = vi.fn();
    const resource = {
      hasSkills: () => false,
    } as unknown as AgentResource;
    const context = { agent: { registerTool } } as unknown as ExtensionContext;

    await createSkillExtension(resource).setup(context);

    expect(registerTool).not.toHaveBeenCalled();
  });
});
