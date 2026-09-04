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

const { default: DatabaseConstructor } = await import("better-sqlite3");

export function openSqliteDatabase(path: string): SqliteDatabase {
  return new DatabaseAdapter(new DatabaseConstructor(path) as NativeDatabase);
}
