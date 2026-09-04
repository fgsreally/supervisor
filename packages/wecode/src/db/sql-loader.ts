import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SqliteDatabase } from "./sqlite.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const sqlDirs = [join(moduleDir, "sql"), join(moduleDir, "db", "sql")];

export function execSqlFile(db: SqliteDatabase, filename: string): void {
  const path = sqlDirs.map((dir) => join(dir, filename)).find((candidate) => existsSync(candidate));
  if (!path) throw new Error(`SQL file not found: ${filename}`);
  db.exec(readFileSync(path, "utf8"));
}
