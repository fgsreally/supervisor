import type { WecodeDb } from "../db/db.js";
import type { ResourceHandler } from "../resources/handler.js";
import { getGlobalResourceDirectory } from "../resources/resource-paths.js";
import {
  installPluginToGlobal,
  uninstallGlobalPlugin,
  updateGlobalPlugin,
} from "./installer.js";
import { listPluginInfosInDirectories, readPluginPackageJson } from "./loader.js";
import type { PluginModuleRegistry } from "./registry.js";

export function getGlobalPluginsDirectory(): string {
  return getGlobalResourceDirectory("plugins");
}

export function createPluginResourceHandler(options: {
  db: WecodeDb;
  registry: PluginModuleRegistry;
  discoveryDirectories?: string[];
  deactivateAgentPlugin?: (agentId: number, slug: string) => Promise<void>;
}): ResourceHandler {
  return {
    kind: "plugin",
    discover() {
      return listPluginInfosInDirectories([
        ...(options.discoveryDirectories ?? []),
        getGlobalPluginsDirectory(),
      ]).map((info) => {
        const pkg = readPluginPackageJson(info.rootDir);
        return {
          kind: "plugin" as const,
          slug: info.id,
          name: info.name ?? info.id,
          description: info.description,
          sourcePath: info.rootDir,
          version: info.version ?? pkg?.version ?? null,
        };
      });
    },
    install({ source }) {
      const result = installPluginToGlobal(source);
      return {
        slug: result.id,
        name: result.id,
        sourcePath: result.rootDir,
        details: {
          rootDir: result.rootDir,
          entryPath: result.entryPath,
          installCommand: result.installCommand,
        },
      };
    },
    update(slug) {
      const result = updateGlobalPlugin(slug);
      return {
        slug: result.id,
        name: result.id,
        sourcePath: result.rootDir,
        details: {
          rootDir: result.rootDir,
          entryPath: result.entryPath,
          installCommand: result.installCommand,
        },
      };
    },
    async uninstall(slug) {
      uninstallGlobalPlugin(slug);
      await options.registry.reload(options.db, slug);
    },
    onCatalogUpdated(slug) {
      return options.registry.reload(options.db, slug);
    },
    onUnbind(agentId, slug) {
      return options.deactivateAgentPlugin?.(agentId, slug);
    },
  };
}
