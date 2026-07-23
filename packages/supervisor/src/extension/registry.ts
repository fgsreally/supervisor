import { loadExtensionModule, requireExtensionEntry } from "./loader.js";
import type { ExtensionDefinition } from "./types.js";
import type { SupervisorDb } from "../db/db.js";

export interface LoadedExtensionModule {
  slug: string;
  definition: ExtensionDefinition;
  path: string;
  entryPath: string;
  error?: string;
}

/**
 * 进程级扩展模块导入缓存。
 * 每个 slug 只导入一次；每个 SessionExtensionHost 只执行一次 setup()。
 */
export class ExtensionModuleRegistry {
  private readonly modules = new Map<string, LoadedExtensionModule>();

  async refresh(db: SupervisorDb): Promise<void> {
    this.modules.clear();
    for (const resource of db.listResources("extension")) {
      if (resource.meta?.builtin === true) continue;
      if (resource.sourcePath?.startsWith("builtin:")) continue;
      await this.loadResource(resource.slug, resource.sourcePath);
    }
  }

  async reload(db: SupervisorDb, slug: string): Promise<void> {
    const resource = db.getResourceByKindSlug("extension", slug);
    if (!resource?.sourcePath || resource.meta?.builtin === true) {
      this.modules.delete(slug);
      return;
    }
    await this.loadResource(slug, resource.sourcePath);
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
      const entryPath = requireExtensionEntry(sourcePath);
      const result = await loadExtensionModule(entryPath);
      if (result.error || !result.definition) {
        this.modules.set(slug, {
          slug,
          definition: { name: slug, setup: () => {} },
          path: sourcePath,
          entryPath,
          error: result.error ?? "Failed to load extension module",
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

  get(slug: string): LoadedExtensionModule | undefined {
    return this.modules.get(slug);
  }

  getMany(slugs: string[]): LoadedExtensionModule[] {
    const out: LoadedExtensionModule[] = [];
    for (const slug of slugs) {
      const mod = this.modules.get(slug);
      if (mod) out.push(mod);
    }
    return out;
  }

  list(): LoadedExtensionModule[] {
    return [...this.modules.values()];
  }
}
