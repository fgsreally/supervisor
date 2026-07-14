import { existsSync, readdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { readExtensionPackageJson } from "../extension-system/extension-entry.js";
import { listExtensionInfosInDirectories } from "../extension-system/loader.js";
import type { SupervisorDb } from "../db/db.js";
import { getGlobalResourceDirs } from "./resource-paths.js";

/** Scan ~/.pi/supervisor/global/ and upsert resources rows (content stays on disk). */
export function syncGlobalCatalogToDb(db: SupervisorDb): void {
  const { extensions, skills, prompts, mcp } = getGlobalResourceDirs();

  for (const info of listExtensionInfosInDirectories([extensions])) {
    const pkg = readExtensionPackageJson(info.rootDir);
    db.upsertResource({
      kind: "extension",
      slug: info.id,
      name: info.name ?? info.id,
      description: info.description,
      source_path: info.rootDir,
      version: info.version ?? pkg?.version ?? null,
    });
  }

  if (existsSync(skills)) {
    for (const entry of readdirSync(skills, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const dir = join(skills, entry.name);
      if (!existsSync(dir)) continue;
      db.upsertResource({
        kind: "skill",
        slug: entry.name,
        name: entry.name,
        source_path: resolve(dir),
      });
    }
  }

  if (existsSync(prompts)) {
    for (const entry of readdirSync(prompts, { withFileTypes: true })) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      if (!entry.name.endsWith(".md")) continue;
      const filePath = join(prompts, entry.name);
      const slug = basename(entry.name, extname(entry.name));
      db.upsertResource({
        kind: "prompt",
        slug,
        name: slug,
        source_path: resolve(filePath),
      });
    }
  }

  if (existsSync(mcp)) {
    for (const entry of readdirSync(mcp, { withFileTypes: true })) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      if (!entry.name.endsWith(".json")) continue;
      const filePath = join(mcp, entry.name);
      const slug = basename(entry.name, ".json");
      db.upsertResource({
        kind: "mcp",
        slug,
        name: slug,
        source_path: resolve(filePath),
      });
    }
  }
}

export function initializeResourceCatalog(db: SupervisorDb): void {
  syncGlobalCatalogToDb(db);
}
