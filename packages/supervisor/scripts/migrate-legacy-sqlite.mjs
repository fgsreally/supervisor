/**
 * One-shot: rebuild ~/.pi/supervisor.db from legacy TEXT-UUID schema
 * to current INTEGER + entry_id schema. Preserves providers/models/agents/
 * projects/sessions/messages/resources.
 */
import * as crypto from "node:crypto";
import { copyFileSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

function encryptApiKey(apiKey) {
  const salt = process.env.SS_ENCRYPTION_SALT || "ss-default-salt";
  const keyFromEnv = process.env.SS_API_KEY_ENCRYPTION_KEY;
  let secretKey;
  if (keyFromEnv) {
    const keyBytes = Buffer.from(keyFromEnv, "hex");
    if (keyBytes.length === 32) secretKey = keyBytes;
  }
  if (!secretKey) {
    secretKey = crypto.pbkdf2Sync(
      process.env.SS_MASTER_PASSWORD || "ss-default-password",
      salt,
      100000,
      32,
      "sha256",
    );
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey, iv);
  let encrypted = cipher.update(apiKey, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag().toString("base64");
  return `${iv.toString("base64")}.${encrypted}.${authTag}`;
}

const DB_PATH = process.env.SS_DB_PATH || join(homedir(), ".pi", "supervisor.db");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const BACKUP = `${DB_PATH}.pre-integer-migrate-${STAMP}`;
const TMP = `${DB_PATH}.migrating-${STAMP}`;

function tableInfo(db, name) {
  return db.prepare(`PRAGMA table_info(${name})`).all();
}

function isLegacy() {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const sessions = tableInfo(db, "sessions");
    const messages = tableInfo(db, "messages");
    const providers = tableInfo(db, "providers");
    const sessionId = sessions.find((c) => c.name === "id");
    const messageEntry = messages.find((c) => c.name === "entry_id");
    const providerId = providers.find((c) => c.name === "id");
    const homeTasks = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='home_tasks'")
      .get();
    return (
      sessionId?.type?.toUpperCase().includes("TEXT") ||
      providerId?.type?.toUpperCase().includes("TEXT") ||
      !messageEntry ||
      !homeTasks
    );
  } finally {
    db.close();
  }
}

function createSchema(db) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF");
  db.exec(`
    CREATE TABLE providers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      slug          TEXT UNIQUE,
      name          TEXT NOT NULL,
      icon          TEXT,
      api_type      TEXT NOT NULL,
      base_url      TEXT,
      api_key       TEXT,
      is_enabled    INTEGER NOT NULL DEFAULT 1,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE models (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id   INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      model_id      TEXT NOT NULL,
      name          TEXT,
      context_window INTEGER NOT NULL DEFAULT 128000,
      supports_vision INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      UNIQUE (provider_id, model_id)
    );

    CREATE TABLE agents (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      description   TEXT,
      avatar        TEXT,
      backend_type  TEXT NOT NULL DEFAULT 'native',
      system_prompt TEXT,
      tools_preset  TEXT NOT NULL DEFAULT 'coding',
      model_id      INTEGER REFERENCES models(id) ON DELETE SET NULL,
      home_dir      TEXT,
      is_builtin    INTEGER NOT NULL DEFAULT 0,
      external_config TEXT,
      disabled_tools TEXT NOT NULL DEFAULT '[]',
      meta          TEXT NOT NULL DEFAULT '{}',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE projects (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      description   TEXT,
      cwd           TEXT NOT NULL UNIQUE,
      home_dir      TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id    INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      parent_id     INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
      status        TEXT NOT NULL DEFAULT 'initializing',
      thinking_level TEXT NOT NULL DEFAULT 'none',
      cwd           TEXT NOT NULL DEFAULT '',
      leaf_id       TEXT,
      agent_id      INTEGER REFERENCES agents(id) ON DELETE SET NULL,
      spawn_type    TEXT,
      created_by    TEXT NOT NULL DEFAULT 'user',
      title         TEXT,
      system_prompt TEXT,
      avatar        TEXT,
      is_builtin    INTEGER NOT NULL DEFAULT 0,
      pinned        INTEGER NOT NULL DEFAULT 0,
      muted         INTEGER NOT NULL DEFAULT 0,
      unread        INTEGER NOT NULL DEFAULT 0,
      external_session_id TEXT,
      error_msg     TEXT,
      stage         TEXT,
      shadow_enabled INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      meta          TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX idx_sessions_parent ON sessions(parent_id);
    CREATE INDEX idx_sessions_status ON sessions(status);
    CREATE INDEX idx_sessions_agent ON sessions(agent_id);
    CREATE INDEX idx_sessions_project ON sessions(project_id);

    CREATE TABLE messages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id      TEXT NOT NULL UNIQUE,
      session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      parent_entry_id TEXT,
      type          TEXT NOT NULL,
      payload       TEXT NOT NULL,
      meta          TEXT NOT NULL DEFAULT '{}',
      is_old        INTEGER NOT NULL DEFAULT 0,
      origin_msg    TEXT,
      role          TEXT,
      search_text   TEXT,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX idx_messages_session ON messages(session_id);
    CREATE INDEX idx_messages_session_role ON messages(session_id, role);
    CREATE INDEX idx_messages_search_text ON messages(search_text) WHERE search_text IS NOT NULL;

    CREATE TABLE session_input_queue (
      id            TEXT PRIMARY KEY,
      session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      message       TEXT NOT NULL,
      level         INTEGER NOT NULL,
      origin_msg    TEXT,
      images        TEXT,
      enqueued_at   INTEGER NOT NULL
    );
    CREATE INDEX idx_session_input_queue_session
      ON session_input_queue(session_id, level DESC, enqueued_at ASC);

    CREATE TABLE project_scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_project_scripts_project ON project_scripts(project_id, kind, id);

    CREATE TABLE home_tasks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      status        TEXT NOT NULL DEFAULT 'todo',
      priority      TEXT NOT NULL DEFAULT 'normal',
      parent_id     INTEGER REFERENCES home_tasks(id) ON DELETE CASCADE,
      session_id    INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
      error         TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
    CREATE INDEX idx_home_tasks_status ON home_tasks(status);
    CREATE INDEX idx_home_tasks_parent ON home_tasks(parent_id);
    CREATE INDEX idx_home_tasks_session ON home_tasks(session_id);
    CREATE INDEX idx_home_tasks_project ON home_tasks(project_id);

    CREATE TABLE resources (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      kind          TEXT NOT NULL,
      slug          TEXT NOT NULL,
      name          TEXT,
      description   TEXT,
      source_path   TEXT,
      version       TEXT,
      meta          TEXT NOT NULL DEFAULT '{}',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      UNIQUE(kind, slug)
    );
    CREATE INDEX idx_resources_kind ON resources(kind);

    CREATE TABLE agent_resources (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id      INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      resource_id   INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      enabled       INTEGER NOT NULL DEFAULT 1,
      priority      INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      UNIQUE(agent_id, resource_id)
    );
    CREATE INDEX idx_agent_resources_agent ON agent_resources(agent_id);
    CREATE INDEX idx_agent_resources_resource ON agent_resources(resource_id);

    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      execution_mode TEXT NOT NULL,
      parent_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      output TEXT NOT NULL DEFAULT '',
      progress TEXT,
      result TEXT,
      error TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );
    CREATE INDEX idx_jobs_session_created ON jobs(session_id, created_at DESC);
    CREATE INDEX idx_jobs_status ON jobs(status);

    CREATE VIRTUAL TABLE messages_fts USING fts5(
      search_text,
      role,
      session_id UNINDEXED,
      message_id UNINDEXED,
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER messages_fts_ai AFTER INSERT ON messages
      WHEN NEW.search_text IS NOT NULL AND NEW.search_text != ''
      BEGIN
        INSERT INTO messages_fts(search_text, role, session_id, message_id)
        VALUES (NEW.search_text, NEW.role, NEW.session_id, NEW.entry_id);
      END;

    CREATE TRIGGER messages_fts_ad AFTER DELETE ON messages BEGIN
      DELETE FROM messages_fts WHERE message_id = OLD.entry_id;
    END;

    CREATE TRIGGER messages_fts_au AFTER UPDATE OF search_text, role ON messages BEGIN
      DELETE FROM messages_fts WHERE message_id = OLD.entry_id;
      INSERT INTO messages_fts(search_text, role, session_id, message_id)
      SELECT NEW.search_text, NEW.role, NEW.session_id, NEW.entry_id
      WHERE NEW.search_text IS NOT NULL AND NEW.search_text != '';
    END;
  `);
}

function maybeEncrypt(apiKey) {
  if (!apiKey) return null;
  // Already encrypted (iv.ciphertext.tag)
  if (apiKey.includes(".") && apiKey.split(".").length === 3) return apiKey;
  return encryptApiKey(apiKey);
}

function migrate() {
  if (!existsSync(DB_PATH)) throw new Error(`DB not found: ${DB_PATH}`);
  if (!isLegacy()) {
    console.log("DB already looks current; nothing to do.");
    return;
  }

  copyFileSync(DB_PATH, BACKUP);
  console.log(`Backup: ${BACKUP}`);

  const old = new Database(DB_PATH, { readonly: true });
  if (existsSync(TMP)) unlinkSync(TMP);
  const next = new Database(TMP);
  createSchema(next);

  const providerMap = new Map(); // old TEXT id -> new INTEGER id
  const agentMap = new Map();
  const modelMap = new Map();
  const sessionMap = new Map();

  const insertProvider = next.prepare(`
    INSERT INTO providers (slug, name, icon, api_type, base_url, api_key, is_enabled, created_at, updated_at)
    VALUES (@slug, @name, @icon, @api_type, @base_url, @api_key, @is_enabled, @created_at, @updated_at)
  `);
  for (const row of old.prepare("SELECT * FROM providers").all()) {
    const result = insertProvider.run({
      slug: row.slug ?? row.id,
      name: row.name,
      icon: row.icon ?? null,
      api_type: row.api_type,
      base_url: row.base_url ?? null,
      api_key: maybeEncrypt(row.api_key),
      is_enabled: row.is_enabled ?? 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
    providerMap.set(String(row.id), Number(result.lastInsertRowid));
  }
  console.log(`providers: ${providerMap.size}`);

  const insertModel = next.prepare(`
    INSERT INTO models (provider_id, model_id, name, context_window, supports_vision, created_at, updated_at)
    VALUES (@provider_id, @model_id, @name, @context_window, @supports_vision, @created_at, @updated_at)
  `);
  let modelCount = 0;
  for (const row of old.prepare("SELECT * FROM models").all()) {
    const providerId = providerMap.get(String(row.provider_id));
    if (providerId == null) {
      console.warn(`skip model ${row.model_id}: missing provider ${row.provider_id}`);
      continue;
    }
    const result = insertModel.run({
      provider_id: providerId,
      model_id: row.model_id,
      name: row.name ?? null,
      context_window: row.context_window ?? 128000,
      supports_vision: row.supports_vision ?? row.supports_multimodal ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at || row.created_at,
    });
    modelMap.set(`${String(row.provider_id)}:${row.model_id}`, Number(result.lastInsertRowid));
    modelCount += 1;
  }
  console.log(`models: ${modelCount}`);

  const insertAgent = next.prepare(`
    INSERT INTO agents (name, description, avatar, backend_type, system_prompt, tools_preset, model_id, home_dir, is_builtin, external_config, disabled_tools, meta, created_at, updated_at)
    VALUES (@name, @description, @avatar, @backend_type, @system_prompt, @tools_preset, @model_id, @home_dir, @is_builtin, @external_config, @disabled_tools, @meta, @created_at, @updated_at)
  `);
  for (const row of old.prepare("SELECT * FROM agents ORDER BY created_at ASC").all()) {
    let meta = {};
    try {
      meta = JSON.parse(row.meta || "{}");
    } catch {
      meta = {};
    }
    const isBuiltin = meta.builtin === true || row.id === "pi-assistant" ? 1 : 0;
    const externalConfig =
      meta.command || meta.args || meta.env || meta.permissionPolicy || meta.external
        ? JSON.stringify({
            ...(typeof meta.command === "string" ? { command: meta.command } : {}),
            ...(Array.isArray(meta.args) ? { args: meta.args } : {}),
            ...(meta.env && typeof meta.env === "object" ? { env: meta.env } : {}),
            ...(typeof meta.permissionPolicy === "string"
              ? { permissionPolicy: meta.permissionPolicy }
              : {}),
            ...(meta.external && typeof meta.external === "object" ? meta.external : {}),
          })
        : null;
    const disabledTools = Array.isArray(meta.disabledTools)
      ? JSON.stringify(meta.disabledTools)
      : "[]";
    for (const key of [
      "builtin",
      "userSpawnable",
      "packagedKind",
      "externalKind",
      "command",
      "args",
      "env",
      "permissionPolicy",
      "external",
      "category",
      "disabledTools",
    ]) {
      delete meta[key];
    }
    const result = insertAgent.run({
      name: row.name,
      description: row.description ?? null,
      avatar: row.avatar ?? row.icon ?? null,
      backend_type: row.backend_type ?? "native",
      system_prompt: row.system_prompt ?? null,
      tools_preset: row.tools_preset ?? "coding",
      model_id:
        row.provider_id == null || row.model_id == null
          ? null
          : (modelMap.get(`${String(row.provider_id)}:${row.model_id}`) ?? null),
      home_dir: row.home_dir ?? null,
      is_builtin: isBuiltin,
      external_config: externalConfig,
      disabled_tools: disabledTools,
      meta: JSON.stringify(meta),
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
    agentMap.set(String(row.id), Number(result.lastInsertRowid));
  }
  console.log(`agents: ${agentMap.size}`);

  const insertProject = next.prepare(`
    INSERT INTO projects (id, name, description, cwd, home_dir, created_at, updated_at)
    VALUES (@id, @name, @description, @cwd, @home_dir, @created_at, @updated_at)
  `);
  for (const row of old.prepare("SELECT * FROM projects").all()) {
    insertProject.run({
      id: row.id,
      name: row.name,
      description: (() => {
        try { return JSON.parse(row.meta ?? "{}").description ?? null; } catch { return null; }
      })(),
      cwd: row.cwd,
      home_dir: row.home_dir ?? row.work_dir,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }
  const projectCount = old.prepare("SELECT COUNT(*) AS c FROM projects").get().c;
  console.log(`projects: ${projectCount}`);

  const insertSession = next.prepare(`
    INSERT INTO sessions (
      project_id, parent_id, status, thinking_level, cwd, leaf_id,
      agent_id, spawn_type, created_by, title, system_prompt, avatar, is_builtin, pinned, muted,
      unread, external_session_id, error_msg, stage, shadow_enabled, created_at, last_active_at, meta
    ) VALUES (
      @project_id, @parent_id, @status, @thinking_level, @cwd, @leaf_id,
      @agent_id, @spawn_type, @created_by, @title, @system_prompt, @avatar, @is_builtin, @pinned,
      @muted, @unread, @external_session_id, @error_msg, @stage, @shadow_enabled,
      @created_at, @last_active_at, @meta
    )
  `);

  // First pass: insert without parent_id, then fix parents
  const oldSessions = old.prepare("SELECT * FROM sessions ORDER BY created_at ASC").all();
  for (const row of oldSessions) {
    const agentId = row.agent_id == null ? null : (agentMap.get(String(row.agent_id)) ?? null);
    const result = insertSession.run({
      project_id: row.project_id ?? null,
      parent_id: null,
      status: row.status === "running" ? "idle" : (row.status ?? "idle"),
      thinking_level: row.thinking_level ?? "none",
      cwd: row.cwd ?? "",
      leaf_id: row.leaf_id ?? null,
      agent_id: agentId,
      spawn_type: row.branch_type === "spawn" ? "subagent" : (row.spawn_type ?? row.branch_type ?? null),
      created_by: row.created_by ?? row.created_via ?? "user",
      title: row.title ?? null,
      system_prompt: row.system_prompt ?? null,
      avatar: row.avatar ?? null,
      is_builtin: row.is_builtin ?? 0,
      pinned: row.pinned ?? 0,
      muted: row.muted ?? 0,
      unread: row.unread ?? 0,
      external_session_id: row.external_session_id ?? row.session_id ?? null,
      error_msg: row.error_msg ?? null,
      stage: row.stage ?? null,
      shadow_enabled: row.shadow_enabled ?? 0,
      created_at: row.created_at,
      last_active_at: row.last_active_at ?? row.created_at,
      meta: (() => {
        try {
          const meta = typeof row.meta === "string" ? JSON.parse(row.meta) : { ...(row.meta ?? {}) };
          delete meta.git;
          delete meta.description;
          return JSON.stringify(meta);
        } catch { return "{}"; }
      })(),
    });
    sessionMap.set(String(row.id), Number(result.lastInsertRowid));
  }
  const updateParent = next.prepare("UPDATE sessions SET parent_id = ? WHERE id = ?");
  for (const row of oldSessions) {
    if (row.parent_id == null) continue;
    const id = sessionMap.get(String(row.id));
    const parentId = sessionMap.get(String(row.parent_id));
    if (id != null && parentId != null) updateParent.run(parentId, id);
  }
  console.log(`sessions: ${sessionMap.size}`);

  const insertMessage = next.prepare(`
    INSERT INTO messages (
      entry_id, session_id, parent_entry_id, type, payload, meta, is_old, origin_msg,
      role, search_text, created_at
    ) VALUES (
      @entry_id, @session_id, @parent_entry_id, @type, @payload, @meta, @is_old, @origin_msg,
      @role, @search_text, @created_at
    )
  `);
  let messageCount = 0;
  let skippedMessages = 0;
  for (const row of old
    .prepare("SELECT * FROM messages ORDER BY created_at ASC, id ASC")
    .all()) {
    const sessionId = sessionMap.get(String(row.session_id));
    if (sessionId == null) {
      skippedMessages += 1;
      continue;
    }
    const entryId = row.entry_id ?? row.id;
    insertMessage.run({
      entry_id: entryId,
      session_id: sessionId,
      parent_entry_id: row.parent_entry_id ?? row.parent_id ?? null,
      type: row.type,
      payload: row.payload,
      meta: row.meta ?? "{}",
      is_old: row.is_old ?? 0,
      origin_msg: row.origin_msg ?? row.origin ?? null,
      role: row.role ?? row.message_role ?? null,
      search_text: row.search_text ?? null,
      created_at: row.created_at,
    });
    messageCount += 1;
  }
  console.log(`messages: ${messageCount} (skipped ${skippedMessages})`);

  const insertResource = next.prepare(`
    INSERT INTO resources (id, kind, slug, name, description, source_path, version, meta, created_at, updated_at)
    VALUES (@id, @kind, @slug, @name, @description, @source_path, @version, @meta, @created_at, @updated_at)
  `);
  let resourceCount = 0;
  try {
    for (const row of old.prepare("SELECT * FROM resources").all()) {
      insertResource.run({
        id: row.id,
        kind: row.kind,
        slug: row.slug,
        name: row.name,
        description: row.description ?? null,
        source_path: row.source_path ?? null,
        version: row.version ?? null,
        meta: row.meta ?? "{}",
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
      resourceCount += 1;
    }
  } catch (error) {
    console.warn("resources migrate:", error.message);
  }
  console.log(`resources: ${resourceCount}`);

  // Preserve sqlite_sequence for projects/resources if we forced ids
  next
    .prepare(
      `INSERT INTO sqlite_sequence(name, seq)
       SELECT 'projects', COALESCE(MAX(id), 0) FROM projects
       WHERE EXISTS (SELECT 1 FROM projects)`,
    )
    .run();
  next
    .prepare(
      `INSERT INTO sqlite_sequence(name, seq)
       SELECT 'resources', COALESCE(MAX(id), 0) FROM resources
       WHERE EXISTS (SELECT 1 FROM resources)`,
    )
    .run();

  old.close();
  next.pragma("foreign_keys = ON");
  next.close();

  // Swap
  const doomed = `${DB_PATH}.legacy-replaced-${STAMP}`;
  renameSync(DB_PATH, doomed);
  renameSync(TMP, DB_PATH);
  // Also remove WAL/SHM from old if present
  for (const suffix of ["-wal", "-shm"]) {
    const p = `${doomed}${suffix}`;
    if (existsSync(p)) unlinkSync(p);
  }
  console.log(`Replaced DB. Old file kept at: ${doomed}`);
  console.log(`Primary backup: ${BACKUP}`);
}

migrate();
