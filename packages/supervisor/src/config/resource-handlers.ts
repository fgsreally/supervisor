import { dirname, join, resolve } from "node:path";
import { promptResourceHandler } from "../agent/prompt-resource.js";
import { getDefaultCwd, resolvePlaygroundPath } from "./default-cwd.js";
import { skillResourceHandler } from "../agent/skill-resource.js";
import type { SupervisorDb } from "../db/db.js";
import { mcpResourceHandler } from "../extension/builtin/mcp/resource.js";
import { createExtensionResourceHandler } from "../extension/resource.js";
import type { ExtensionModuleRegistry } from "../extension/registry.js";
import { indexResourceHandlers } from "../resources/handler.js";

export function createResourceHandlers(options: {
  db: SupervisorDb;
  extensionRegistry: ExtensionModuleRegistry;
  deactivateAgentExtension: (agentId: number, slug: string) => Promise<void>;
}) {
  const playground = resolvePlaygroundPath();
  const workspace = getDefaultCwd();
  const repositoryExtensions =
    playground && resolve(workspace) === resolve(playground)
      ? [join(dirname(playground), "extensions")]
      : [];
  return indexResourceHandlers([
    skillResourceHandler,
    promptResourceHandler,
    mcpResourceHandler,
    createExtensionResourceHandler({
      db: options.db,
      registry: options.extensionRegistry,
      discoveryDirectories: repositoryExtensions,
      deactivateAgentExtension: options.deactivateAgentExtension,
    }),
  ]);
}
