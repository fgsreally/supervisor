import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { SessionExtensionHost } from "../extension/runtime/index.js";

export const PACKAGED_TOOL_IDS = [
  "ask",
  "edit",
  "lsp",
  "ast-grep",
  "web",
  "browser",
  "output-minimizer",
] as const;

export type PackagedToolId = (typeof PACKAGED_TOOL_IDS)[number];

export function isPackagedToolId(value: string): value is PackagedToolId {
  return (PACKAGED_TOOL_IDS as readonly string[]).includes(value);
}

export interface PackagedToolContext {
  cwd: string;
  sessionId: number;
}

export interface PackagedToolActivation {
  tools: AgentTool[];
  cleanup?: () => void | Promise<void>;
  attachHooks?: (extension: SessionExtensionHost) => void;
  pausing?: { message: string };
}

export async function activatePackagedTool(
  id: PackagedToolId,
  ctx: PackagedToolContext,
): Promise<PackagedToolActivation> {
  switch (id) {
    case "ask": {
      const { createAskTool } = await import("./ask/tool.js");
      return {
        tools: [createAskTool(ctx.sessionId)],
        pausing: { message: "ask tool waiting for user answer" },
      };
    }
    case "edit": {
      const { createOverrideEditTool } = await import("./edit/tool.js");
      return { tools: [createOverrideEditTool(ctx.cwd)] };
    }
    case "lsp": {
      const { createOverrideLspTool } = await import("./lsp/tool.js");
      return { tools: [createOverrideLspTool(ctx.cwd)] };
    }
    case "ast-grep": {
      const { createAstGrepTool } = await import("./ast-grep/tool.js");
      return { tools: [createAstGrepTool(ctx.cwd)] };
    }
    case "web": {
      const [{ createWebSearchTool }, { createWebFetchTool }] = await Promise.all([
        import("./web/web-search-tool.js"),
        import("./web/web-fetch-tool.js"),
      ]);
      return {
        tools: [createWebSearchTool(), createWebFetchTool()],
      };
    }
    case "browser": {
      const { createBrowserTool } = await import("./browser/tool.js");
      const { tool, cleanup } = createBrowserTool();
      return { tools: [tool], cleanup };
    }
    case "output-minimizer": {
      const { attachOutputMinimizerHook } = await import("./output-minimizer/hook.js");
      return {
        tools: [],
        attachHooks: attachOutputMinimizerHook,
      };
    }
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown packaged tool: ${_exhaustive}`);
    }
  }
}

export async function probePackagedTool(
  id: PackagedToolId,
  cwd: string,
): Promise<Array<{ name: string; description: string }>> {
  if (id === "output-minimizer") {
    return [{ name: "(hook)", description: "Bash output minimizer hook" }];
  }
  const activation = await activatePackagedTool(id, { cwd, sessionId: 0 });
  return activation.tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? tool.name,
  }));
}
