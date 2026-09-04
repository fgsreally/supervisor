import { dirname, join, resolve } from "node:path";
import { promptResourceHandler } from "../core/resource/prompt-resource.js";
import { getDefaultCwd, resolvePlaygroundPath } from "./default-cwd.js";
import { skillResourceHandler } from "../agent/skill-resource.js";
import type { WecodeDb } from "../db/db.js";
import { mcpResourceHandler } from "../plugin/builtin/mcp/resource.js";
import { createPluginResourceHandler } from "../plugin/resource.js";
import type { PluginModuleRegistry } from "../plugin/registry.js";
import { indexResourceHandlers } from "../resources/handler.js";

export function createResourceHandlers(options: {
  db: WecodeDb;
  pluginRegistry: PluginModuleRegistry;
  deactivateAgentPlugin: (agentId: number, slug: string) => Promise<void>;
}) {
  const playground = resolvePlaygroundPath();
  const workspace = getDefaultCwd();
  const repositoryPlugins =
    playground && resolve(workspace) === resolve(playground)
      ? [join(dirname(playground), "plugins")]
      : [];
  return indexResourceHandlers([
    skillResourceHandler,
    promptResourceHandler,
    mcpResourceHandler,
    createPluginResourceHandler({
      db: options.db,
      registry: options.pluginRegistry,
      discoveryDirectories: repositoryPlugins,
      deactivateAgentPlugin: options.deactivateAgentPlugin,
    }),
  ]);
}
