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

class DatabaseAdapter implements SqliteDatabase {
  constructor(private readonly native: NativeDatabase) {}

  prepare(sql: string): SqliteStatement {
    return this.native.prepare(sql);
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
  if ((globalThis as { Bun?: unknown }).Bun) {
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
