import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateSessionTasksToMeta, convergeLegacySchema } from "./legacy-data-migrations.js";
import type { SqliteDatabase } from "./sqlite.js";

const MIGRATION_TABLE = "_schema_migrations";

/** Programmatic migrations keyed by numeric version (same prefix as `.sql` files). */
const PROGRAMMATIC_MIGRATIONS = new Map<
  number,
  { name: string; run: (db: SqliteDatabase) => void }
>([[4, { name: "session_tasks_to_meta", run: migrateSessionTasksToMeta }]]);

export interface RunMigrationsOptions {
  /** Extra directories scanned after built-in migrations (fork / deploy custom SQL). */
  extraDirs?: string[];
}

type MigrationEntry =
  | { version: number; name: string; kind: "sql"; path: string }
  | { version: number; name: string; kind: "programmatic"; run: (db: SqliteDatabase) => void };

function moduleDir(): string {
  return join(fileURLToPath(import.meta.url), "..");
}

/** Built-in and dist migration directories (mirrors `sql-loader` layout). */
export function resolveMigrationDirs(extraDirs: string[] = []): string[] {
  const root = moduleDir();
  const dirs = [
    join(root, "migrations"),
    join(root, "db", "migrations"),
    join(root, "..", "migrations"),
  ];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const dir of [...dirs, ...extraDirs]) {
    const normalized = dir.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (existsSync(normalized)) ordered.push(normalized);
  }
  return ordered;
}

function parseMigrationVersion(filename: string): number | null {
  const match = /^(\d+)_.+\.sql$/i.exec(filename);
  return match ? Number(match[1]) : null;
}

function isIgnorableSqliteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /duplicate column name/i.test(message) ||
    /no such table/i.test(message) ||
    /already exists/i.test(message)
  );
}

function ensureMigrationTable(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    );
  `);
}

function appliedMigrationNames(db: SqliteDatabase): Set<string> {
  const rows = db.prepare(`SELECT name FROM ${MIGRATION_TABLE}`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function markMigrationApplied(db: SqliteDatabase, name: string): void {
  db.prepare(`INSERT INTO ${MIGRATION_TABLE} (name, applied_at) VALUES (?, ?)`).run(
    name,
    Date.now(),
  );
}

function collectMigrationEntries(dirs: string[]): MigrationEntry[] {
  const byVersion = new Map<number, MigrationEntry>();

  for (const dir of dirs) {
    for (const filename of readdirSync(dir)) {
      const version = parseMigrationVersion(filename);
      if (version == null) continue;
      const fullPath = join(dir, filename);
      const entry: MigrationEntry = {
        version,
        name: basename(filename, ".sql"),
        kind: "sql",
        path: fullPath,
      };
      const existing = byVersion.get(version);
      if (existing && existing.kind === "sql" && existing.path !== fullPath) {
        throw new Error(
          `Duplicate migration version ${String(version).padStart(3, "0")}: ${existing.path} and ${fullPath}`,
        );
      }
      byVersion.set(version, entry);
    }
  }

  for (const [version, migration] of PROGRAMMATIC_MIGRATIONS) {
    if (byVersion.has(version)) continue;
    byVersion.set(version, {
      version,
      name: migration.name,
      kind: "programmatic",
      run: migration.run,
    });
  }

  return [...byVersion.values()].sort((left, right) => left.version - right.version);
}

function runSqlMigration(db: SqliteDatabase, path: string): void {
  const sql = readFileSync(path, "utf8").trim();
  if (!sql) return;
  try {
    db.exec(sql);
  } catch (error: unknown) {
    if (isIgnorableSqliteError(error)) return;
    throw error;
  }
}

function migrationTrackingName(entry: MigrationEntry): string {
  return entry.kind === "sql"
    ? basename(entry.path)
    : `${String(entry.version).padStart(3, "0")}_${entry.name}`;
}

/** Apply pending SQL / programmatic migrations in numeric order. */
export function runMigrations(db: SqliteDatabase, options: RunMigrationsOptions = {}): void {
  ensureMigrationTable(db);
  const applied = appliedMigrationNames(db);
  const entries = collectMigrationEntries(resolveMigrationDirs(options.extraDirs));

  for (const entry of entries) {
    const trackingName = migrationTrackingName(entry);
    if (applied.has(trackingName)) continue;

    const apply = db.transaction(() => {
      if (entry.kind === "sql") {
        runSqlMigration(db, entry.path);
      } else {
        entry.run(db);
      }
      markMigrationApplied(db, trackingName);
    });
    apply();
  }

  convergeLegacySchema(db);
}

/** Extra migration directories from `SUPERVISOR_MIGRATIONS_DIRS` (comma-separated paths). */
export function migrationDirsFromEnv(): string[] {
  const raw = process.env.SUPERVISOR_MIGRATIONS_DIRS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
