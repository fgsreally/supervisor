import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { MessageStorage } from "./message-storage";
import type { SyncMeta, TurnIndex } from "./types";

const DB_NAME = "supervisor_session_archive";

/**
 * Capacitor Android/iOS implementation backed by @capacitor-community/sqlite.
 */
export class CapacitorMessageStorage extends MessageStorage {
  readonly kind = "capacitor" as const;
  readonly persistent = true;

  private sqlite = new SQLiteConnection(CapacitorSQLite);
  private db: SQLiteDBConnection | null = null;

  async init(): Promise<void> {
    const consistency = await this.sqlite.checkConnectionsConsistency();
    const isConn = (await this.sqlite.isConnection(DB_NAME, false)).result;
    if (consistency.result && isConn) {
      this.db = await this.sqlite.retrieveConnection(DB_NAME, false);
    } else {
      this.db = await this.sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
    }
    await this.db.open();
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS turns (
        session_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        user_entry_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        role_hint TEXT NOT NULL,
        PRIMARY KEY (session_id, turn_id)
      );
      CREATE TABLE IF NOT EXISTS sync_meta (
        session_id TEXT PRIMARY KEY NOT NULL,
        oldest_row_id INTEGER,
        newest_row_id INTEGER,
        has_more INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS turns_by_session ON turns(session_id, created_at);
    `);
  }

  private requireDb(): SQLiteDBConnection {
    if (!this.db) throw new Error("CapacitorMessageStorage not initialized");
    return this.db;
  }

  async getSyncMeta(sessionId: string): Promise<SyncMeta | null> {
    const db = this.requireDb();
    const result = await db.query(`SELECT * FROM sync_meta WHERE session_id = ?`, [sessionId]);
    const row = result.values?.[0] as
      | {
          session_id: string;
          oldest_row_id: number | null;
          newest_row_id: number | null;
          has_more: number;
          updated_at: number;
        }
      | undefined;
    if (!row) return null;
    return {
      sessionId: row.session_id,
      oldestRowId: row.oldest_row_id ?? null,
      newestRowId: row.newest_row_id ?? null,
      hasMore: Boolean(row.has_more),
      updatedAt: row.updated_at,
    };
  }

  async putSyncMeta(meta: SyncMeta): Promise<void> {
    const db = this.requireDb();
    await db.run(
      `INSERT OR REPLACE INTO sync_meta
        (session_id, oldest_row_id, newest_row_id, has_more, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [meta.sessionId, meta.oldestRowId, meta.newestRowId, meta.hasMore ? 1 : 0, meta.updatedAt],
    );
  }

  async listTurns(sessionId: string): Promise<TurnIndex[]> {
    const db = this.requireDb();
    const result = await db.query(
      `SELECT session_id, turn_id, user_entry_id, summary, created_at, role_hint
       FROM turns WHERE session_id = ? ORDER BY created_at ASC, turn_id ASC`,
      [sessionId],
    );
    return (result.values ?? []).map((row) => {
      const r = row as {
        session_id: string;
        turn_id: string;
        user_entry_id: string;
        summary: string;
        created_at: number;
        role_hint: string;
      };
      return {
        sessionId: r.session_id,
        turnId: r.turn_id,
        userEntryId: r.user_entry_id,
        summary: r.summary,
        createdAt: r.created_at,
        roleHint: "user" as const,
      };
    });
  }

  async upsertTurns(sessionId: string, turns: TurnIndex[]): Promise<void> {
    if (!turns.length) return;
    const db = this.requireDb();
    for (const turn of turns) {
      await db.run(
        `INSERT OR REPLACE INTO turns
          (session_id, turn_id, user_entry_id, summary, created_at, role_hint)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sessionId, turn.turnId, turn.userEntryId, turn.summary, turn.createdAt, turn.roleHint],
      );
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const db = this.requireDb();
    await db.run(`DELETE FROM turns WHERE session_id = ?`, [sessionId]);
    await db.run(`DELETE FROM sync_meta WHERE session_id = ?`, [sessionId]);
  }

  async listCachedSessionIds(): Promise<string[]> {
    const db = this.requireDb();
    const fromMeta = await db.query(`SELECT session_id FROM sync_meta`);
    const fromTurns = await db.query(`SELECT DISTINCT session_id FROM turns`);
    const ids = new Set<string>();
    for (const row of fromMeta.values ?? []) {
      const id = (row as { session_id: string }).session_id;
      if (id) ids.add(id);
    }
    for (const row of fromTurns.values ?? []) {
      const id = (row as { session_id: string }).session_id;
      if (id) ids.add(id);
    }
    return [...ids];
  }
}
