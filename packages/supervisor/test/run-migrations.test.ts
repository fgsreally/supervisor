import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openSqliteDatabase } from "../src/db/sqlite.js";
import { runMigrations } from "../src/db/run-migrations.js";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "supervisor-migrations-"));
  dbPath = join(tmpDir, "test.db");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("runMigrations", () => {
  it("records applied migrations and skips them on subsequent runs", () => {
    const db = openSqliteDatabase(dbPath);
    db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY)");
    runMigrations(db);

    const firstCount = (
      db.prepare("SELECT COUNT(*) AS count FROM _schema_migrations").get() as { count: number }
    ).count;
    expect(firstCount).toBeGreaterThan(0);

    runMigrations(db);
    const secondCount = (
      db.prepare("SELECT COUNT(*) AS count FROM _schema_migrations").get() as { count: number }
    ).count;
    expect(secondCount).toBe(firstCount);
    db.close();
  });

  it("applies extra migration directories from fork / deploy overlays", () => {
    const db = openSqliteDatabase(dbPath);
    db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY)");

    const extraDir = join(tmpDir, "custom-migrations");
    mkdirSync(extraDir, { recursive: true });
    writeFileSync(
      join(extraDir, "010_add_widget.sql"),
      "CREATE TABLE IF NOT EXISTS widgets (id INTEGER PRIMARY KEY);",
    );

    runMigrations(db, { extraDirs: [extraDir] });
    expect(
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE name = 'widgets'").get(),
    ).toBeTruthy();
    expect(
      db.prepare("SELECT name FROM _schema_migrations WHERE name = ?").get("010_add_widget.sql"),
    ).toBeTruthy();
    db.close();
  });
});
