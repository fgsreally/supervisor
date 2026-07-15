import type { SupervisorDb } from "../db/db.js";
import type { ResourceHandler } from "../resources/handler.js";
import { getGlobalResourceDirectory } from "../resources/resource-paths.js";
import {
  installExtensionToGlobal,
  uninstallGlobalExtension,
  updateGlobalExtension,
} from "./installer.js";
import { listExtensionInfosInDirectories, readExtensionPackageJson } from "./loader.js";
import type { ExtensionModuleRegistry } from "./registry.js";

export function getGlobalExtensionsDirectory(): string {
  return getGlobalResourceDirectory("extensions");
}

export function createExtensionResourceHandler(options: {
  db: SupervisorDb;
  registry: ExtensionModuleRegistry;
  deactivateAgentExtension?: (agentId: number, slug: string) => Promise<void>;
}): ResourceHandler {
  return {
    kind: "extension",
    discover() {
      return listExtensionInfosInDirectories([getGlobalExtensionsDirectory()]).map((info) => {
        const pkg = readExtensionPackageJson(info.rootDir);
        return {
          kind: "extension" as const,
          slug: info.id,
          name: info.name ?? info.id,
          description: info.description,
          sourcePath: info.rootDir,
          version: info.version ?? pkg?.version ?? null,
        };
      });
    },
    install({ source }) {
      const result = installExtensionToGlobal(source);
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
      const result = updateGlobalExtension(slug);
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
      uninstallGlobalExtension(slug);
      await options.registry.reload(options.db, slug);
    },
    onCatalogUpdated(slug) {
      return options.registry.reload(options.db, slug);
    },
    onUnbind(agentId, slug) {
      return options.deactivateAgentExtension?.(agentId, slug);
    },
  };
}
