import { loadPluginModule, requirePluginEntry } from "./loader.js";
import type { AnyPluginDefinition } from "./types.js";
import type { WecodeDb } from "../db/db.js";
import { ensurePluginExternalAgents } from "./external-agents.js";

export interface LoadedPluginModule {
  slug: string;
  definition: AnyPluginDefinition;
  path: string;
  entryPath: string;
  error?: string;
}

/**
 * 进程级插件模块导入缓存。
 * 每个 slug 只导入一次；每个 SessionPluginHost 只执行一次 setup()。
 */
export class PluginModuleRegistry {
  private readonly modules = new Map<string, LoadedPluginModule>();

  async refresh(db: WecodeDb): Promise<void> {
    this.modules.clear();
    for (const resource of db.listResources("plugin")) {
      if (resource.meta?.builtin === true) continue;
      if (resource.sourcePath?.startsWith("builtin:")) continue;
      await this.loadResource(resource.slug, resource.sourcePath);
      const loaded = this.modules.get(resource.slug);
      if (loaded?.definition.externalAgents?.length) {
        ensurePluginExternalAgents(db, resource.slug, loaded.definition.externalAgents);
      }
    }
  }

  async reload(db: WecodeDb, slug: string): Promise<void> {
    const resource = db.getResourceByKindSlug("plugin", slug);
    if (!resource?.sourcePath || resource.meta?.builtin === true) {
      this.modules.delete(slug);
      return;
    }
    await this.loadResource(slug, resource.sourcePath);
    const loaded = this.modules.get(slug);
    if (loaded?.definition.externalAgents?.length) {
      ensurePluginExternalAgents(db, slug, loaded.definition.externalAgents);
    }
  }

  private async loadResource(slug: string, sourcePath: string | null): Promise<void> {
    if (!sourcePath) {
      this.modules.set(slug, {
        slug,
        definition: { name: slug, setup: () => {} },
        path: "",
        entryPath: "",
        error: "Missing source_path",
      });
      return;
    }
    try {
      const entryPath = requirePluginEntry(sourcePath);
      const result = await loadPluginModule(entryPath);
      if (result.error || !result.definition) {
        this.modules.set(slug, {
          slug,
          definition: { name: slug, setup: () => {} },
          path: sourcePath,
          entryPath,
          error: result.error ?? "Failed to load plugin module",
        });
        return;
      }
      this.modules.set(slug, {
        slug,
        definition: result.definition,
        path: sourcePath,
        entryPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.modules.set(slug, {
        slug,
        definition: { name: slug, setup: () => {} },
        path: sourcePath,
        entryPath: "",
        error: message,
      });
    }
  }

  get(slug: string): LoadedPluginModule | undefined {
    return this.modules.get(slug);
  }

  getMany(slugs: string[]): LoadedPluginModule[] {
    const out: LoadedPluginModule[] = [];
    for (const slug of slugs) {
      const mod = this.modules.get(slug);
      if (mod) out.push(mod);
    }
    return out;
  }

  list(): LoadedPluginModule[] {
    return [...this.modules.values()];
  }
}
