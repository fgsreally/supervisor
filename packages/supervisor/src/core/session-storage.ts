import { randomUUID } from "node:crypto";
import type {
  SessionMetadata,
  SessionStorage,
  SessionTreeEntry,
} from "@earendil-works/pi-agent-core";
import type { SupervisorDb } from "../db/db.js";
import { extractMessageSearchFields } from "../db/message-search.js";
import type {
  MessageRow,
  Session,
  SessionMessageResponse,
  SupervisorHarnessMetadata,
} from "../types.js";

export interface AppendEntryOptions {
  meta?: Record<string, unknown>;
  isOld?: boolean;
  source?: string | null;
}

export class SQLiteSessionStorage implements SessionStorage {
  private db: SupervisorDb;
  private sessionId: number;
  private pendingUserMessageSources: Array<{ source: string | null; consumed: boolean }> = [];

  constructor(db: SupervisorDb, sessionId: number) {
    this.db = db;
    this.sessionId = sessionId;
  }

  async getMetadata(): Promise<SessionMetadata> {
    return this.getHarnessMetadata();
  }

  async getHarnessMetadata(): Promise<SupervisorHarnessMetadata> {
    const session = this.db.get(this.sessionId);
    if (!session) throw new Error(`Session ${this.sessionId} not found`);
    return {
      id: session.id,
      createdAt: new Date(session.created_at).toISOString(),
      meta: (typeof session.meta === "string" ? JSON.parse(session.meta) : session.meta) ?? {},
    };
  }

  async getLeafId(): Promise<string | null> {
    const session = this.db.get(this.sessionId);
    return session?.leaf_id ?? null;
  }

  async setLeafId(leafId: string | null): Promise<void> {
    this.db.db
      .prepare("UPDATE sessions SET leaf_id = ?, last_active_at = ? WHERE id = ?")
      .run(leafId, Date.now(), this.sessionId);
  }

  async createEntryId(): Promise<string> {
    return randomUUID();
  }

  queueUserMessageSource(source?: string | null): () => void {
    const item = { source: source ?? null, consumed: false };
    this.pendingUserMessageSources.push(item);
    return () => {
      if (item.consumed) return;
      const index = this.pendingUserMessageSources.indexOf(item);
      if (index !== -1) this.pendingUserMessageSources.splice(index, 1);
    };
  }

  private consumeQueuedSource(entry: SessionTreeEntry): string | null {
    if (entry.type !== "message" || entry.message.role !== "user") return null;
    const item = this.pendingUserMessageSources.shift();
    if (!item) return null;
    item.consumed = true;
    return item.source;
  }

  async appendEntry(entry: SessionTreeEntry, options: AppendEntryOptions = {}): Promise<void> {
    const { messageRole, searchText } = extractMessageSearchFields(entry);
    const source = Object.hasOwn(options, "source")
      ? (options.source ?? null)
      : this.consumeQueuedSource(entry);
    this.db.db
      .prepare(
        `INSERT INTO messages (entry_id, session_id, parent_entry_id, type, payload, meta, is_old, source, message_role, search_text, created_at)
         VALUES (@entry_id, @session_id, @parent_entry_id, @type, @payload, @meta, @is_old, @source, @message_role, @search_text, @created_at)`,
      )
      .run({
        entry_id: entry.id,
        session_id: this.sessionId,
        parent_entry_id: entry.parentId ?? null,
        type: entry.type,
        payload: JSON.stringify(entry),
        meta: JSON.stringify(options.meta ?? {}),
        is_old: options.isOld ? 1 : 0,
        source,
        message_role: messageRole,
        search_text: searchText,
        created_at: Date.now(),
      });
    await this.setLeafId(entry.id);
  }

  async getEntry(id: string): Promise<SessionTreeEntry | undefined> {
    const row = this.db.db
      .prepare("SELECT payload FROM messages WHERE entry_id = ? AND session_id = ?")
      .get(id, this.sessionId) as { payload: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(row.payload) as SessionTreeEntry;
  }

  async findEntries<TType extends SessionTreeEntry["type"]>(
    type: TType,
  ): Promise<Array<Extract<SessionTreeEntry, { type: TType }>>> {
    const rows = this.db.db
      .prepare(
        "SELECT payload FROM messages WHERE type = ? AND session_id = ? ORDER BY created_at ASC",
      )
      .all(type, this.sessionId) as Array<{ payload: string }>;
    return rows.map((r) => JSON.parse(r.payload));
  }

  async getLabel(id: string): Promise<string | undefined> {
    const entries = await this.findEntries("label");
    let currentLabel: string | undefined;
    for (const entry of entries) {
      if (entry.targetId === id) {
        currentLabel = entry.label;
      }
    }
    return currentLabel;
  }

  async getPathToRoot(leafId: string | null): Promise<SessionTreeEntry[]> {
    if (!leafId) return [];

    const rows = this.db.db
      .prepare("SELECT payload, parent_entry_id FROM messages WHERE session_id = ?")
      .all(this.sessionId) as Array<{ payload: string; parent_entry_id: string | null }>;

    const byId = new Map<string, { payload: string; parent_entry_id: string | null }>();
    for (const row of rows) {
      const parsed = JSON.parse(row.payload) as SessionTreeEntry;
      byId.set(parsed.id, { payload: row.payload, parent_entry_id: row.parent_entry_id });
    }

    const path: SessionTreeEntry[] = [];
    let currentId: string | null = leafId;
    while (currentId) {
      const node = byId.get(currentId);
      if (!node) break;
      path.push(JSON.parse(node.payload));
      currentId = node.parent_entry_id;
    }
    return path.reverse();
  }

  async getEntries(): Promise<SessionTreeEntry[]> {
    const rows = await this.getStoredMessages();
    return rows.map((row) => row.entry);
  }

  async getStoredMessages(): Promise<
    Array<{
      entry: SessionTreeEntry;
      meta: Record<string, unknown>;
      isOld: boolean;
      source: string | null;
      createdAt: number;
    }>
  > {
    const rows = this.db.getMessageRows(this.sessionId);
    return rows.map((row) => rowToStoredMessage(row));
  }
}

/**
 * BTW sessions read a frozen path from their parent before their own entries.
 * Writes are inherited from SQLiteSessionStorage and therefore remain isolated
 * in the child session.
 */
export class BtwSessionStorage extends SQLiteSessionStorage {
  private readonly parentStorage: SQLiteSessionStorage;

  constructor(
    db: SupervisorDb,
    sessionId: number,
    parentSessionId: number,
    private readonly contextLeafId: string | null,
    parentStorage?: SQLiteSessionStorage,
  ) {
    super(db, sessionId);
    this.parentStorage = parentStorage ?? new SQLiteSessionStorage(db, parentSessionId);
  }

  override async getLeafId(): Promise<string | null> {
    return (await super.getLeafId()) ?? this.contextLeafId;
  }

  override async getEntry(id: string): Promise<SessionTreeEntry | undefined> {
    return (await super.getEntry(id)) ?? this.parentStorage.getEntry(id);
  }

  override async findEntries<TType extends SessionTreeEntry["type"]>(
    type: TType,
  ): Promise<Array<Extract<SessionTreeEntry, { type: TType }>>> {
    const entries = await this.getEntries();
    return entries.filter(
      (entry): entry is Extract<SessionTreeEntry, { type: TType }> => entry.type === type,
    );
  }

  override async getPathToRoot(leafId: string | null): Promise<SessionTreeEntry[]> {
    if (!leafId) return [];
    const parentPath = await this.parentStorage.getPathToRoot(this.contextLeafId);
    if (leafId === this.contextLeafId) return parentPath;
    return [...parentPath, ...(await super.getPathToRoot(leafId))];
  }

  override async getEntries(): Promise<SessionTreeEntry[]> {
    return this.getPathToRoot(await this.getLeafId());
  }
}

export function createRuntimeSessionStorage(
  db: SupervisorDb,
  session: Session,
): SQLiteSessionStorage {
  return createStorage(
    db,
    session.id,
    session.parentId,
    session.branchType,
    session.contextLeafId,
    new Set(),
  );
}

function createStorage(
  db: SupervisorDb,
  sessionId: number,
  parentId: number | null,
  branchType: string | null,
  contextLeafId: string | null,
  ancestors: Set<number>,
): SQLiteSessionStorage {
  if (branchType === "btw" && parentId != null && !ancestors.has(sessionId)) {
    const nextAncestors = new Set(ancestors).add(sessionId);
    const parent = db.get(parentId);
    const parentStorage = parent
      ? createStorage(
          db,
          parent.id,
          parent.parent_id,
          parent.branch_type,
          parent.context_leaf_id ?? null,
          nextAncestors,
        )
      : new SQLiteSessionStorage(db, parentId);
    return new BtwSessionStorage(db, sessionId, parentId, contextLeafId, parentStorage);
  }
  return new SQLiteSessionStorage(db, sessionId);
}

function rowToStoredMessage(row: MessageRow): {
  entry: SessionTreeEntry;
  meta: Record<string, unknown>;
  isOld: boolean;
  source: string | null;
  createdAt: number;
} {
  return {
    entry: JSON.parse(row.payload) as SessionTreeEntry,
    meta: JSON.parse(row.meta),
    isOld: row.is_old === 1,
    source: row.source,
    createdAt: row.created_at,
  };
}

export function toSessionMessageResponse(stored: {
  entry: SessionTreeEntry;
  meta: Record<string, unknown>;
  isOld: boolean;
  source: string | null;
  createdAt: number;
}): SessionMessageResponse {
  return {
    ...stored.entry,
    isOld: stored.isOld,
    source: stored.source,
    meta: stored.meta,
    createdAt: stored.createdAt,
  };
}
