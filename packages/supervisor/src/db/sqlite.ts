export interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): SqliteRunResult;
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): unknown;
  close(): void;
  pragma(source: string): unknown;
  transaction<T extends (...args: any[]) => any>(callback: T): T;
}

interface NativeDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): unknown;
  close(): void;
  transaction<T extends (...args: any[]) => any>(callback: T): T;
}

type NativeDatabaseConstructor = new (path: string) => NativeDatabase;

function usingBun(): boolean {
  return Boolean((globalThis as { Bun?: unknown }).Bun);
}

/**
 * bun:sqlite expects named-param object keys to include the `@` / `$` / `:` prefix.
 * better-sqlite3 accepts bare keys. Normalize so call sites can keep using `{ name: "…" }`.
 */
function normalizeNamedParams(params: unknown[]): unknown[] {
  if (!usingBun() || params.length !== 1) return params;
  const only = params[0];
  if (!only || typeof only !== "object" || Array.isArray(only)) return params;
  const input = only as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith("@") || key.startsWith("$") || key.startsWith(":")) {
      out[key] = value;
    } else {
      out[`@${key}`] = value;
    }
  }
  return [out];
}

function wrapStatement(stmt: SqliteStatement): SqliteStatement {
  if (!usingBun()) return stmt;
  return {
    all(...params: unknown[]) {
      return stmt.all(...normalizeNamedParams(params));
    },
    get(...params: unknown[]) {
      return stmt.get(...normalizeNamedParams(params));
    },
    run(...params: unknown[]) {
      return stmt.run(...normalizeNamedParams(params));
    },
  };
}

class DatabaseAdapter implements SqliteDatabase {
  constructor(private readonly native: NativeDatabase) {}

  prepare(sql: string): SqliteStatement {
    return wrapStatement(this.native.prepare(sql));
  }

  exec(sql: string): unknown {
    return this.native.exec(sql);
  }

  close(): void {
    this.native.close();
  }

  pragma(source: string): unknown {
    if (source.includes("=")) return this.native.exec(`PRAGMA ${source}`);
    return this.native.prepare(`PRAGMA ${source}`).all();
  }

  transaction<T extends (...args: any[]) => any>(callback: T): T {
    return this.native.transaction(callback);
  }
}

async function loadDatabaseConstructor(): Promise<NativeDatabaseConstructor> {
  if (usingBun()) {
    const module = await import("bun:sqlite");
    return module.Database as unknown as NativeDatabaseConstructor;
  }
  const module = await import("better-sqlite3");
  return module.default as unknown as NativeDatabaseConstructor;
}

const DatabaseConstructor = await loadDatabaseConstructor();

export function openSqliteDatabase(path: string): SqliteDatabase {
  return new DatabaseAdapter(new DatabaseConstructor(path));
}
