import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ensureAgentHome, getAgentHomeDir } from "../agent/index.js";
import { resolveDbPath } from "../config/resolve-db-path.js";
import { encryptApiKey, decryptApiKey } from "../utils/encrypt.js";
import type {
  AgentResourceBinding,
  Resource,
  ResourceKind,
  ResourceRow,
  AgentResourceRow,
} from "../resources/types.js";
import type {
  Agent,
  AgentBackendType,
  AgentRow,
  CreateHomeTaskOptions,
  HomeTask,
  HomeTaskPriority,
  HomeTaskRow,
  HomeTaskStatus,
  MessageRow,
  MessageSearchHit,
  Model,
  ModelRow,
  Project,
  ProjectRow,
  Provider,
  ProviderRow,
  SessionRow,
  SessionStatus,
  SessionTaskRow,
  SessionTodoRow,
  UpdateHomeTaskOptions,
} from "../types.js";
import { HOME_TASK_PRIORITIES, HOME_TASK_STATUSES, normalizeSessionStatus } from "../types.js";
import { getProjectDir } from "../core/session-files.js";
import {
  ensureProjectScriptsTable,
  listProjectScripts,
  migrateLegacyProjectCommands,
  replaceProjectScripts,
  type ProjectScriptInput,
  type ProjectScriptKind,
} from "../core/project-scripts.js";

function parseHomeTaskStatus(value: string): HomeTaskStatus {
  return (HOME_TASK_STATUSES as readonly string[]).includes(value)
    ? (value as HomeTaskStatus)
    : "todo";
}

function parseHomeTaskPriority(value: string): HomeTaskPriority {
  return (HOME_TASK_PRIORITIES as readonly string[]).includes(value)
    ? (value as HomeTaskPriority)
    : "normal";
}

function syntheticMetaId(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) || 1;
}

function normalizeTodoStatus(value: unknown): SessionTodoRow["status"] {
  if (value === "in_progress" || value === "completed" || value === "cancelled") return value;
  return "pending";
}

function rowToHomeTask(row: HomeTaskRow): HomeTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    projectId: row.project_id,
    status: parseHomeTaskStatus(row.status),
    priority: parseHomeTaskPriority(row.priority),
    parentId: row.parent_id,
    sessionId: row.session_id,
    error: row.error,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToSession(row: SessionRow): SessionRow {
  const createdBy =
    row.created_by ??
    row.created_via ??
    (row.spawn_type === "subagent" || row.spawn_type === "spawn"
      ? "spawn_agent"
      : (row.spawn_type as SessionRow["created_by"]) ?? "user");
  return {
    ...row,
    status: normalizeSessionStatus(row.status),
    spawn_type: row.spawn_type === "spawn" ? "subagent" : row.spawn_type,
    created_by: createdBy,
    title: row.title ?? null,
    system_prompt: row.system_prompt ?? null,
    avatar: row.avatar ?? null,
    is_builtin: row.is_builtin ?? 0,
    pinned: row.pinned ?? 0,
    muted: row.muted ?? 0,
    unread: row.unread ?? 0,
    external_session_id: row.external_session_id ?? null,
    error_msg: row.error_msg ?? null,
    stage: row.stage ?? null,
    shadow_enabled: row.shadow_enabled ?? 0,
    meta: JSON.parse(typeof row.meta === "string" ? row.meta : JSON.stringify(row.meta ?? {})) as any,
  };
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cwd: row.cwd,
    homeDir: row.home_dir,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    avatar: row.avatar,
    providerId: row.resolved_provider_id ?? null,
    backendType: row.backend_type ?? "native",
    modelId: row.model_id,
    systemPrompt: row.system_prompt,
    toolsPreset: (row.tools_preset as "coding" | "readonly" | "none") || null,
    homeDir: row.home_dir ?? null,
    isBuiltin: Boolean(row.is_builtin),
    externalConfig: row.external_config
      ? (JSON.parse(row.external_config) as Agent["externalConfig"])
      : null,
    disabledTools: (() => {
      try {
        const value = JSON.parse(row.disabled_tools ?? "[]") as unknown;
        return Array.isArray(value)
          ? value.filter((tool): tool is string => typeof tool === "string")
          : [];
      } catch {
        return [];
      }
    })(),
    meta: JSON.parse(row.meta),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToProvider(row: ProviderRow): Provider {
  let apiKey: string | null = null;
  if (row.api_key) {
    try {
      apiKey = decryptApiKey(row.api_key);
    } catch {
      // Credentials encrypted with an unavailable legacy key must not prevent startup.
    }
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    icon: row.icon,
    apiType: row.api_type,
    baseUrl: row.base_url,
    apiKey,
    isEnabled: Boolean(row.is_enabled),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    kind: row.kind as ResourceKind,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sourcePath: row.source_path,
    version: row.version,
    meta: JSON.parse(row.meta),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToModel(row: ModelRow): Model {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    name: row.name,
    contextWindow: row.context_window,
    supportsVision: Boolean(row.supports_vision),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class SupervisorDb {
  public readonly db: Database.Database;
  private readonly statusListeners = new Set<(id: number, status: SessionStatus) => void>();

  constructor(dbPath?: string) {
    const resolved = resolveDbPath(dbPath);
    mkdirSync(join(resolved, ".."), { recursive: true });
    this.db = new Database(resolved);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
			CREATE TABLE IF NOT EXISTS providers (
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

			CREATE TABLE IF NOT EXISTS models (
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

			CREATE TABLE IF NOT EXISTS agents (
				id            INTEGER PRIMARY KEY AUTOINCREMENT,
				name          TEXT NOT NULL,
				description   TEXT,
				avatar        TEXT,
				backend_type  TEXT NOT NULL DEFAULT 'native',
				system_prompt TEXT,
				tools_preset  TEXT,
				model_id      INTEGER REFERENCES models(id) ON DELETE SET NULL,
				home_dir      TEXT,
				is_builtin    INTEGER NOT NULL DEFAULT 0,
        external_config TEXT,
        disabled_tools TEXT NOT NULL DEFAULT '[]',
				meta          TEXT NOT NULL DEFAULT '{}',
				created_at    INTEGER NOT NULL,
				updated_at    INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS projects (
				id            INTEGER PRIMARY KEY AUTOINCREMENT,
				name          TEXT NOT NULL,
				description   TEXT,
				cwd           TEXT NOT NULL UNIQUE,
				home_dir      TEXT NOT NULL,
				created_at    INTEGER NOT NULL,
				updated_at    INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS sessions (
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
			CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id);
			CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
			CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);

		`);

    this.ensureProjectScripts();
    this.migrateMembersToSubagentIds();
    this.ensureSessionTaskTables();
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
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
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session_role ON messages(session_id, role);
      CREATE INDEX IF NOT EXISTS idx_messages_search_text ON messages(search_text) WHERE search_text IS NOT NULL;
      CREATE TABLE IF NOT EXISTS session_input_queue (
        id            TEXT PRIMARY KEY,
        session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        message       TEXT NOT NULL,
        level         INTEGER NOT NULL,
        origin_msg    TEXT,
        images        TEXT,
        enqueued_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session_input_queue_session
        ON session_input_queue(session_id, level DESC, enqueued_at ASC);
      CREATE TABLE IF NOT EXISTS home_tasks (
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
      CREATE INDEX IF NOT EXISTS idx_home_tasks_status ON home_tasks(status);
      CREATE INDEX IF NOT EXISTS idx_home_tasks_parent ON home_tasks(parent_id);
      CREATE INDEX IF NOT EXISTS idx_home_tasks_session ON home_tasks(session_id);
      CREATE INDEX IF NOT EXISTS idx_home_tasks_project ON home_tasks(project_id);

      DROP TABLE IF EXISTS extensions;

      CREATE TABLE IF NOT EXISTS resources (
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
      CREATE INDEX IF NOT EXISTS idx_resources_kind ON resources(kind);

      CREATE TABLE IF NOT EXISTS agent_resources (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id      INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        resource_id   INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        enabled       INTEGER NOT NULL DEFAULT 1,
        priority      INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        UNIQUE(agent_id, resource_id)
      );
      CREATE INDEX IF NOT EXISTS idx_agent_resources_agent ON agent_resources(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_resources_resource ON agent_resources(resource_id);
    `);
    this.rebuildTargetSchema();
    this.ensureMessageFts();
    this.ensureHomeTaskColumns();

    // Initialize default providers from environment variables
    this.initializeDefaultProviders();
  }

  /** Drop legacy home_tasks.meta (unused). */
  private ensureHomeTaskColumns(): void {
    const exists = this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'home_tasks'")
      .get();
    if (!exists) return;
    const names = new Set(
      (this.db.pragma("table_info(home_tasks)") as Array<{ name: string }>).map((c) => c.name),
    );
    if (names.has("meta")) {
      this.db.exec("ALTER TABLE home_tasks DROP COLUMN meta");
    }
  }

  /** Rebuild evolving core tables so existing databases have the exact target columns. */
  private rebuildTargetSchema(): void {
    const columns = (table: string) =>
      new Set(
        (this.db.pragma(`table_info(${table})`) as Array<{ name: string }>).map(
          (column) => column.name,
        ),
      );
    const pick = (names: Set<string>, name: string, fallback: string) =>
      names.has(name) ? name : fallback;

    const modelColumns = columns("models");
    const agentColumns = columns("agents");
    const projectColumns = columns("projects");
    const scriptColumns = columns("project_scripts");
    const sessionColumns = columns("sessions");
    const messageColumns = columns("messages");
    const queueColumns = columns("session_input_queue");

    this.db.exec(`
      DROP TRIGGER IF EXISTS messages_fts_ai;
      DROP TRIGGER IF EXISTS messages_fts_ad;
      DROP TRIGGER IF EXISTS messages_fts_au;
      DROP TABLE IF EXISTS messages_fts;
      PRAGMA foreign_keys = OFF;
    `);
    const rebuild = this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE models_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
          model_id TEXT NOT NULL,
          name TEXT,
          context_window INTEGER NOT NULL DEFAULT 128000,
          supports_vision INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(provider_id, model_id)
        );
        INSERT INTO models_new
          (id, provider_id, model_id, name, context_window, supports_vision, created_at, updated_at)
        SELECT id, provider_id, model_id, name, context_window,
          ${pick(modelColumns, "supports_vision", pick(modelColumns, "supports_multimodal", "0"))},
          created_at, updated_at
        FROM models;

        CREATE TABLE agents_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          avatar TEXT,
          backend_type TEXT NOT NULL DEFAULT 'native',
          model_id INTEGER REFERENCES models_new(id) ON DELETE SET NULL,
          system_prompt TEXT,
          tools_preset TEXT NOT NULL DEFAULT 'coding',
          home_dir TEXT,
          is_builtin INTEGER NOT NULL DEFAULT 0,
          external_config TEXT,
          disabled_tools TEXT NOT NULL DEFAULT '[]',
          meta TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        INSERT INTO agents_new
          (id, name, description, avatar, backend_type, model_id, system_prompt, tools_preset,
           home_dir, is_builtin, external_config, disabled_tools, meta, created_at, updated_at)
        SELECT a.id, a.name, a.description,
          ${pick(agentColumns, "avatar", pick(agentColumns, "icon", "NULL"))},
          ${pick(agentColumns, "backend_type", "'native'")},
          CASE
            WHEN typeof(a.model_id) = 'integer' THEN a.model_id
            ELSE (SELECT m.id FROM models m
                  WHERE m.model_id = a.model_id
                    ${agentColumns.has("provider_id") ? "AND m.provider_id = a.provider_id" : ""}
                  LIMIT 1)
          END,
          ${pick(agentColumns, "system_prompt", "NULL")},
          COALESCE(${pick(agentColumns, "tools_preset", "NULL")}, 'coding'),
          ${pick(agentColumns, "home_dir", "NULL")},
          COALESCE(${pick(agentColumns, "is_builtin", pick(agentColumns, "is_internal", "0"))}, 0),
          ${pick(agentColumns, "external_config", "NULL")},
          COALESCE(${pick(agentColumns, "disabled_tools", "NULL")}, '[]'),
          COALESCE(${pick(agentColumns, "meta", "NULL")}, '{}'),
          a.created_at, a.updated_at
        FROM agents a;

        CREATE TABLE projects_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          cwd TEXT NOT NULL UNIQUE,
          home_dir TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        INSERT INTO projects_new (id, name, description, cwd, home_dir, created_at, updated_at)
        SELECT id, name,
          ${projectColumns.has("description")
            ? "description"
            : projectColumns.has("meta")
              ? "CASE WHEN json_valid(meta) THEN json_extract(meta, '$.description') ELSE NULL END"
              : "NULL"},
          cwd, ${pick(projectColumns, "home_dir", pick(projectColumns, "work_dir", "''"))},
          created_at, updated_at
        FROM projects;

        CREATE TABLE project_scripts_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects_new(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          name TEXT NOT NULL,
          command TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        INSERT INTO project_scripts_new
          (id, project_id, kind, name, command, created_at, updated_at)
        SELECT id, project_id, kind, name, command, created_at, updated_at FROM project_scripts;

        CREATE TABLE sessions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER REFERENCES projects_new(id) ON DELETE CASCADE,
          parent_id INTEGER REFERENCES sessions_new(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'initializing',
          thinking_level TEXT NOT NULL DEFAULT 'none',
          cwd TEXT NOT NULL DEFAULT '',
          leaf_id TEXT,
          agent_id INTEGER REFERENCES agents_new(id) ON DELETE SET NULL,
          spawn_type TEXT,
          created_by TEXT NOT NULL DEFAULT 'user',
          title TEXT,
          system_prompt TEXT,
          avatar TEXT,
          is_builtin INTEGER NOT NULL DEFAULT 0,
          pinned INTEGER NOT NULL DEFAULT 0,
          muted INTEGER NOT NULL DEFAULT 0,
          unread INTEGER NOT NULL DEFAULT 0,
          external_session_id TEXT,
          error_msg TEXT,
          stage TEXT,
          shadow_enabled INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          last_active_at INTEGER NOT NULL,
          meta TEXT NOT NULL DEFAULT '{}'
        );
        INSERT INTO sessions_new
          (id, project_id, parent_id, status, thinking_level, cwd, leaf_id, agent_id, spawn_type,
           created_by, title, system_prompt, avatar, is_builtin, pinned, muted, unread,
           external_session_id, error_msg, stage, shadow_enabled, created_at, last_active_at, meta)
        SELECT id, ${pick(sessionColumns, "project_id", "NULL")}, parent_id,
          CASE WHEN status = 'starting' THEN 'initializing'
               WHEN status IN ('waiting_user', 'needs_model') THEN 'blocked' ELSE status END,
          ${pick(sessionColumns, "thinking_level", "'none'")}, cwd, leaf_id, agent_id,
          CASE WHEN ${pick(sessionColumns, "spawn_type", pick(sessionColumns, "branch_type", "NULL"))} = 'spawn'
               THEN 'subagent' ELSE ${pick(sessionColumns, "spawn_type", pick(sessionColumns, "branch_type", "NULL"))} END,
          ${pick(sessionColumns, "created_by", pick(sessionColumns, "created_via", "'user'"))},
          ${pick(sessionColumns, "title", "NULL")},
          ${pick(sessionColumns, "system_prompt", "NULL")},
          ${pick(sessionColumns, "avatar", "NULL")},
          COALESCE(${pick(sessionColumns, "is_builtin", "0")}, 0),
          COALESCE(${pick(sessionColumns, "pinned", "0")}, 0),
          COALESCE(${pick(sessionColumns, "muted", "0")}, 0),
          COALESCE(${pick(sessionColumns, "unread", "0")}, 0),
          ${pick(sessionColumns, "external_session_id", "NULL")},
          ${pick(sessionColumns, "error_msg", "NULL")},
          ${pick(sessionColumns, "stage", "NULL")},
          COALESCE(${pick(sessionColumns, "shadow_enabled", "0")}, 0),
          created_at, last_active_at,
          CASE WHEN json_valid(meta)
            THEN json_remove(meta, '$.git', '$.description') ELSE '{}' END
        FROM sessions;

        CREATE TABLE messages_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_id TEXT NOT NULL UNIQUE,
          session_id INTEGER NOT NULL REFERENCES sessions_new(id) ON DELETE CASCADE,
          parent_entry_id TEXT,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          meta TEXT NOT NULL DEFAULT '{}',
          is_old INTEGER NOT NULL DEFAULT 0,
          origin_msg TEXT,
          role TEXT,
          search_text TEXT,
          created_at INTEGER NOT NULL
        );
        INSERT INTO messages_new
          (id, entry_id, session_id, parent_entry_id, type, payload, meta, is_old,
           origin_msg, role, search_text, created_at)
        SELECT id, entry_id, session_id, parent_entry_id, type, payload, meta, is_old,
          ${pick(messageColumns, "origin_msg", pick(messageColumns, "origin", "NULL"))},
          ${pick(messageColumns, "role", pick(messageColumns, "message_role", "NULL"))},
          search_text, created_at FROM messages;

        CREATE TABLE session_input_queue_new (
          id TEXT PRIMARY KEY,
          session_id INTEGER NOT NULL REFERENCES sessions_new(id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          level INTEGER NOT NULL,
          origin_msg TEXT,
          images TEXT,
          enqueued_at INTEGER NOT NULL
        );
        INSERT INTO session_input_queue_new
          (id, session_id, message, level, origin_msg, images, enqueued_at)
        SELECT id, session_id, message, level,
          ${pick(queueColumns, "origin_msg", pick(queueColumns, "origin", "NULL"))},
          images, enqueued_at FROM session_input_queue;

        DROP TABLE messages;
        DROP TABLE session_input_queue;
        DROP TABLE project_scripts;
        DROP TABLE sessions;
        DROP TABLE agents;
        DROP TABLE models;
        DROP TABLE projects;
        ALTER TABLE models_new RENAME TO models;
        ALTER TABLE agents_new RENAME TO agents;
        ALTER TABLE projects_new RENAME TO projects;
        ALTER TABLE project_scripts_new RENAME TO project_scripts;
        ALTER TABLE sessions_new RENAME TO sessions;
        ALTER TABLE messages_new RENAME TO messages;
        ALTER TABLE session_input_queue_new RENAME TO session_input_queue;
      `);
    });
    rebuild();
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session_role ON messages(session_id, role);
      CREATE INDEX IF NOT EXISTS idx_messages_search_text
        ON messages(search_text) WHERE search_text IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_session_input_queue_session
        ON session_input_queue(session_id, level DESC, enqueued_at ASC);
      CREATE INDEX IF NOT EXISTS idx_project_scripts_project
        ON project_scripts(project_id, kind, id);
    `);
  }

  private ensureProjectScripts(): void {
    ensureProjectScriptsTable(this.db);
    migrateLegacyProjectCommands(this.db);
  }

  listProjectScripts(projectId: number, kind?: ProjectScriptKind) {
    return listProjectScripts(this.db, projectId, kind);
  }

  replaceProjectScripts(projectId: number, scripts: ProjectScriptInput[]) {
    return replaceProjectScripts(this.db, projectId, scripts);
  }

  private ensureSessionSchemaColumns(): void {
    const columns = this.db.pragma("table_info(sessions)") as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));

    if (names.has("created_via") && !names.has("created_by")) {
      this.db.exec("ALTER TABLE sessions RENAME COLUMN created_via TO created_by");
      names.delete("created_via");
      names.add("created_by");
    } else if (!names.has("created_by")) {
      this.db.exec("ALTER TABLE sessions ADD COLUMN created_by TEXT NOT NULL DEFAULT 'user'");
      names.add("created_by");
    }

    const addText = (name: string) => {
      if (!names.has(name)) {
        this.db.exec(`ALTER TABLE sessions ADD COLUMN ${name} TEXT`);
        names.add(name);
      }
    };
    const addInt = (name: string, def: number) => {
      if (!names.has(name)) {
        this.db.exec(
          `ALTER TABLE sessions ADD COLUMN ${name} INTEGER NOT NULL DEFAULT ${def}`,
        );
        names.add(name);
      }
    };

    addText("title");
    addText("system_prompt");
    addText("avatar");
    addInt("is_builtin", 0);
    addInt("pinned", 0);
    addInt("muted", 0);
    addInt("unread", 0);
    addText("external_session_id");
    addText("error_msg");
    addText("stage");
    addInt("shadow_enabled", 0);
    // One-time backfill from legacy meta keys / git_* columns into dedicated columns + meta.git.
    this.db.exec(`
      UPDATE sessions SET title = json_extract(meta, '$.name')
      WHERE title IS NULL AND json_extract(meta, '$.name') IS NOT NULL
    `);
    this.db.exec(`
      UPDATE sessions SET avatar = json_extract(meta, '$.avatar')
      WHERE avatar IS NULL AND json_extract(meta, '$.avatar') IS NOT NULL
    `);
    this.db.exec(`
      UPDATE sessions SET is_builtin = 1
      WHERE is_builtin = 0 AND json_extract(meta, '$.builtin') = 1
    `);
    this.db.exec(`
      UPDATE sessions SET pinned = 1
      WHERE pinned = 0 AND json_extract(meta, '$.pinned') = 1
    `);
    this.db.exec(`
      UPDATE sessions SET muted = 1
      WHERE muted = 0 AND json_extract(meta, '$.muted') = 1
    `);
    this.db.exec(`
      UPDATE sessions SET unread = CAST(json_extract(meta, '$.unread') AS INTEGER)
      WHERE unread = 0 AND json_extract(meta, '$.unread') IS NOT NULL
    `);
    this.db.exec(`
      UPDATE sessions SET external_session_id = json_extract(meta, '$.externalSessionId')
      WHERE external_session_id IS NULL
        AND json_extract(meta, '$.externalSessionId') IS NOT NULL
    `);
    this.db.exec(`
      UPDATE sessions SET error_msg = json_extract(meta, '$.runtimeStartError')
      WHERE error_msg IS NULL AND json_extract(meta, '$.runtimeStartError') IS NOT NULL
    `);
    this.db.exec(`
      UPDATE sessions SET stage = json_extract(meta, '$.workflow.stage')
      WHERE stage IS NULL AND json_extract(meta, '$.workflow.stage') IS NOT NULL
    `);
    this.db.exec(`
      UPDATE sessions SET shadow_enabled = 1
      WHERE shadow_enabled = 0 AND json_extract(meta, '$.shadowDisabled') = 0
    `);
    this.db.exec(`
      UPDATE sessions SET system_prompt = json_extract(meta, '$.runtimeConfig.systemPrompt')
      WHERE system_prompt IS NULL
        AND json_extract(meta, '$.runtimeConfig.systemPrompt') IS NOT NULL
    `);
    this.db.exec(`
      UPDATE sessions SET status = 'blocked',
        error_msg = COALESCE(error_msg, 'Agent 未配置模型')
      WHERE status = 'idle' AND json_extract(meta, '$.modelRequired') = 1
    `);
    this.db.exec(`
      UPDATE sessions SET status = 'blocked'
      WHERE status IN ('needs_model', 'waiting_user')
    `);

    // Move git_* columns (if present) and legacy meta.git into meta.git.worktreePath shape.
    if (names.has("git_worktree_enabled") || names.has("git_last_commit") || names.has("git_merge_error")) {
      const rows = this.db
        .prepare(
          `SELECT id, cwd, project_id, meta,
            ${names.has("git_worktree_enabled") ? "git_worktree_enabled" : "0"} AS git_worktree_enabled,
            ${names.has("git_last_commit") ? "git_last_commit" : "NULL"} AS git_last_commit,
            ${names.has("git_merge_error") ? "git_merge_error" : "NULL"} AS git_merge_error
           FROM sessions`,
        )
        .all() as Array<{
        id: number;
        cwd: string;
        project_id: number | null;
        meta: string;
        git_worktree_enabled: number;
        git_last_commit: string | null;
        git_merge_error: string | null;
      }>;
      const updateMeta = this.db.prepare("UPDATE sessions SET meta = ? WHERE id = ?");
      for (const row of rows) {
        let meta: Record<string, unknown> = {};
        try {
          meta = JSON.parse(row.meta || "{}") as Record<string, unknown>;
        } catch {
          meta = {};
        }
        const legacyGit =
          meta.git && typeof meta.git === "object" && !Array.isArray(meta.git)
            ? ({ ...(meta.git as Record<string, unknown>) } as Record<string, unknown>)
            : {};
        let lastCommit = legacyGit.lastCommit ?? null;
        if (!lastCommit && row.git_last_commit) {
          try {
            lastCommit = JSON.parse(row.git_last_commit);
          } catch {
            lastCommit = null;
          }
        }
        const mergeError =
          (typeof legacyGit.mergeError === "string" ? legacyGit.mergeError : null) ??
          row.git_merge_error ??
          null;
        const worktreeEnabled =
          row.git_worktree_enabled === 1 ||
          legacyGit.worktreeEnabled === true ||
          typeof legacyGit.worktreePath === "string";
        let worktreePath =
          typeof legacyGit.worktreePath === "string" ? legacyGit.worktreePath : null;
        if (worktreeEnabled && !worktreePath && row.project_id != null) {
          const project = this.getProject(row.project_id);
          if (project) {
            worktreePath = `${project.cwd.replace(/\\/g, "/")}/.pi/supervisor/worktrees/${row.id}`;
          }
        }
        if (worktreeEnabled && !worktreePath && row.cwd) {
          worktreePath = row.cwd;
        }
        meta.git = {
          ...(typeof legacyGit.branch === "string" ? { branch: legacyGit.branch } : {}),
          worktreePath: worktreeEnabled ? worktreePath : null,
          ...(lastCommit ? { lastCommit } : {}),
          ...(mergeError ? { mergeError } : {}),
        };
        updateMeta.run(JSON.stringify(meta), row.id);
      }
    }
  }

  /** Move the legacy spawned-agent whitelist into sessions.meta, then remove its table. */
  private migrateMembersToSubagentIds(): void {
    const exists = this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'members'")
      .get();
    if (!exists) return;

    const migrate = this.db.transaction(() => {
      const rows = this.db
        .prepare(
          `SELECT s.id, s.meta, m.agent_id
           FROM sessions s
           LEFT JOIN members m ON m.session_id = s.id AND m.role = 'spawned'
           ORDER BY s.id, m.created_at`,
        )
        .all() as Array<{ id: number; meta: string; agent_id: number | null }>;
      const sessions = new Map<number, { meta: string; agentIds: number[] }>();
      for (const row of rows) {
        const session = sessions.get(row.id) ?? { meta: row.meta, agentIds: [] };
        if (row.agent_id !== null) session.agentIds.push(row.agent_id);
        sessions.set(row.id, session);
      }
      const update = this.db.prepare("UPDATE sessions SET meta = ? WHERE id = ?");
      for (const [id, session] of sessions) {
        let meta: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(session.meta || "{}") as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            meta = parsed as Record<string, unknown>;
          }
        } catch {
          // Preserve usable spawned-agent membership even if legacy metadata is malformed.
        }
        const existing = Array.isArray(meta.subagentIds)
          ? meta.subagentIds.filter((value): value is number => Number.isInteger(value))
          : [];
        meta.subagentIds = [...new Set([...existing, ...session.agentIds])];
        update.run(JSON.stringify(meta), id);
      }
      this.db.exec("DROP TABLE members");
    });
    migrate();
  }

  private ensureSessionTaskTables(): void {
    const tables = new Set(
      (this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>).map((row) => row.name),
    );
    if (!tables.has("session_tasks") && !tables.has("session_todos")) return;

    const columns = new Set(
      (this.db.pragma("table_info(sessions)") as Array<{ name: string }>).map((column) => column.name),
    );
    const taskRows = tables.has("session_tasks")
      ? (this.db.prepare("SELECT * FROM session_tasks ORDER BY created_at ASC, id ASC").all() as SessionTaskRow[])
      : [];
    const todoRows = tables.has("session_todos")
      ? (this.db.prepare("SELECT * FROM session_todos ORDER BY sort_order ASC, id ASC").all() as SessionTodoRow[])
      : [];
    const tasksBySession = new Map<number, SessionTaskRow[]>();
    const todosBySession = new Map<number, SessionTodoRow[]>();
    for (const task of taskRows) tasksBySession.set(task.session_id, [...(tasksBySession.get(task.session_id) ?? []), task]);
    for (const todo of todoRows) todosBySession.set(todo.session_id, [...(todosBySession.get(todo.session_id) ?? []), todo]);

    const sessionRows = this.db
      .prepare(`SELECT id, meta${columns.has("current_task_id") ? ", current_task_id" : ""} FROM sessions`)
      .all() as Array<{ id: number; meta: string; current_task_id?: number | null }>;
    const update = this.db.prepare("UPDATE sessions SET meta = ? WHERE id = ?");
    const migrate = this.db.transaction(() => {
      for (const row of sessionRows) {
        let meta: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(row.meta || "{}") as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) meta = parsed as Record<string, unknown>;
        } catch {
          // Preserve no invalid JSON; replace only with the migratable task state.
        }
        const taskMap = new Map<string, { path: string; kind: "goal" | "plan"; title: string | null; status: string | null }>();
        const addTask = (value: unknown) => {
          const path = typeof value === "string" ? value : value && typeof value === "object" ? (value as { path?: unknown }).path : undefined;
          if (typeof path !== "string" || !path.trim()) return;
          const item = value && typeof value === "object" ? value as { kind?: unknown; title?: unknown; status?: unknown } : {};
          taskMap.set(path, {
            path,
            kind: item.kind === "plan" || path.startsWith("plan/") || path.includes("/plan-") ? "plan" : "goal",
            title: typeof item.title === "string" ? item.title : null,
            status: typeof item.status === "string" ? item.status : null,
          });
        };
        if (Array.isArray(meta.tasks)) for (const task of meta.tasks) addTask(task);
        for (const task of tasksBySession.get(row.id) ?? []) {
          taskMap.set(task.path, { path: task.path, kind: task.kind, title: task.title, status: task.status });
        }

        const todoItems: Array<{ title: string; status: "pending" | "in_progress" | "completed" | "cancelled" }> = [];
        const addTodo = (value: unknown) => {
          if (!value || typeof value !== "object") return;
          const item = value as { title?: unknown; status?: unknown };
          if (typeof item.title !== "string" || !item.title.trim()) return;
          const status = item.status === "in_progress" || item.status === "completed" || item.status === "cancelled"
            ? item.status
            : item.status === "done" ? "completed" : "pending";
          if (!todoItems.some((todo) => todo.title === item.title.trim() && todo.status === status)) {
            todoItems.push({ title: item.title.trim(), status });
          }
        };
        if (Array.isArray(meta.todos)) for (const todo of meta.todos) addTodo(todo);
        for (const todo of todosBySession.get(row.id) ?? []) addTodo(todo);

        const currentTaskRow = row.current_task_id == null
          ? undefined
          : (tasksBySession.get(row.id) ?? []).find((task) => task.id === row.current_task_id);
        const currentTask = currentTaskRow?.path ??
          (typeof meta.currentTask === "string" && taskMap.has(meta.currentTask) ? meta.currentTask : null);
        meta.tasks = [...taskMap.values()];
        meta.currentTask = currentTask;
        meta.todos = todoItems;
        update.run(JSON.stringify(meta), row.id);
      }
      this.db.exec("DROP TABLE IF EXISTS session_tasks; DROP TABLE IF EXISTS session_todos;");
    });
    migrate();
  }

  private projectNameFromCwd(cwd: string): string {
    return cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "Project";
  }

  // ============ Project Methods ============

  findOrCreateProjectByCwd(
    cwd: string,
    options?: { name?: string; description?: string | null },
  ): Project {
    const existing = this.db.prepare("SELECT * FROM projects WHERE cwd = ?").get(cwd) as
      | ProjectRow
      | undefined;
    if (existing) return rowToProject(existing);

    const now = Date.now();
    const result = this.db
      .prepare(
        `INSERT INTO projects (name, description, cwd, home_dir, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        options?.name ?? this.projectNameFromCwd(cwd),
        options?.description ?? null,
        cwd,
        "",
        now,
        now,
      );
    const id = Number(result.lastInsertRowid);
    const homeDir = getProjectDir(id);
    mkdirSync(homeDir, { recursive: true });
    this.db.prepare("UPDATE projects SET home_dir = ? WHERE id = ?").run(homeDir, id);
    return this.getProject(id)!;
  }

  insertProject(row: { name?: string; description?: string | null; cwd: string }): Project {
    return this.findOrCreateProjectByCwd(row.cwd, {
      name: row.name,
      description: row.description,
    });
  }

  updateProject(
    id: number,
    patch: { name?: string; description?: string | null },
  ): Project {
    const project = this.getProject(id);
    if (!project) throw new Error(`Project ${id} not found`);
    const name =
      typeof patch.name === "string" && patch.name.trim() ? patch.name.trim() : project.name;
    const description = patch.description === undefined ? project.description : patch.description;
    this.db
      .prepare("UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?")
      .run(name, description, Date.now(), id);
    return this.getProject(id)!;
  }

  getProject(id: number): Project | undefined {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as
      | ProjectRow
      | undefined;
    return row ? rowToProject(row) : undefined;
  }

  listProjects(): Project[] {
    const rows = this.db
      .prepare("SELECT * FROM projects ORDER BY updated_at DESC")
      .all() as ProjectRow[];
    return rows.map(rowToProject);
  }

  deleteProject(id: number): void {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  // ============ Session Methods ============

  insert(
    row: Omit<
      SessionRow,
      | "id"
      | "created_at"
      | "last_active_at"
      | "leaf_id"
      | "agent_id"
      | "spawn_type"
      | "created_by"
      | "thinking_level"
    > & {
      created_at?: number;
      last_active_at?: number;
      leaf_id?: string | null;
      agent_id?: number | null;
      spawn_type?: SessionBranchType | null;
      created_by?: SessionRow["created_by"];
      thinking_level?: "none" | "low" | "medium" | "high";
      title?: string | null;
      system_prompt?: string | null;
      avatar?: string | null;
      is_builtin?: number;
      pinned?: number;
      muted?: number;
      unread?: number;
      external_session_id?: string | null;
      error_msg?: string | null;
      stage?: string | null;
      shadow_enabled?: number;
    },
  ): SessionRow {
    const now = Date.now();
    const full: SessionRow = {
      project_id: row.project_id ?? null,
      parent_id: row.parent_id ?? null,
      status: normalizeSessionStatus(row.status ?? "initializing"),
      cwd: row.cwd ?? "",
      meta: typeof row.meta === "string" ? row.meta : JSON.stringify(row.meta ?? {}),
      created_at: now,
      last_active_at: now,
      leaf_id: row.leaf_id ?? null,
      agent_id: row.agent_id ?? null,
      spawn_type: row.spawn_type ?? null,
      created_by: row.created_by ?? "user",
      title: row.title ?? null,
      system_prompt: row.system_prompt ?? null,
      avatar: row.avatar ?? null,
      is_builtin: row.is_builtin ?? 0,
      pinned: row.pinned ?? 0,
      muted: row.muted ?? 0,
      unread: row.unread ?? 0,
      external_session_id: row.external_session_id ?? null,
      error_msg: row.error_msg ?? null,
      stage: row.stage ?? null,
      shadow_enabled: row.shadow_enabled ?? 0,
      ...row,
      thinking_level:
        row.thinking_level === "low" ||
        row.thinking_level === "medium" ||
        row.thinking_level === "high"
          ? row.thinking_level
          : "none",
    };
    const result = this.db
      .prepare(
        `INSERT INTO sessions (
          project_id, parent_id, status, thinking_level, cwd, leaf_id, agent_id,
          spawn_type, created_by,
          title, system_prompt, avatar, is_builtin, pinned, muted, unread,
          external_session_id, error_msg, stage, shadow_enabled,
          created_at, last_active_at, meta
        ) VALUES (
          @project_id, @parent_id, @status, @thinking_level, @cwd, @leaf_id, @agent_id,
          @spawn_type, @created_by,
          @title, @system_prompt, @avatar, @is_builtin, @pinned, @muted, @unread,
          @external_session_id, @error_msg, @stage, @shadow_enabled,
          @created_at, @last_active_at, @meta
        )`,
      )
      .run(full);
    return rowToSession({ ...full, id: Number(result.lastInsertRowid) });
  }

  get(id: number): SessionRow | undefined {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      | SessionRow
      | undefined;
    return row ? rowToSession(row) : undefined;
  }

  list(filter?: {
    status?: SessionStatus;
    parentId?: number | null;
    cwd?: string;
    projectId?: number;
    showInSessionList?: boolean;
  }): SessionRow[] {
    let sql = "SELECT * FROM sessions WHERE 1=1";
    const params: any[] = [];
    if (filter?.status) {
      sql += " AND status = ?";
      params.push(filter.status);
    }
    if (filter?.parentId !== undefined) {
      sql += filter.parentId === null ? " AND parent_id IS NULL" : " AND parent_id = ?";
      if (filter.parentId !== null) params.push(filter.parentId);
    }
    if (filter?.projectId !== undefined) {
      sql += " AND project_id = ?";
      params.push(filter.projectId);
    }
    if (filter?.showInSessionList !== undefined) {
      sql += filter.showInSessionList
        ? " AND (spawn_type IS NULL OR spawn_type IN ('fork', 'clone'))"
        : " AND spawn_type IN ('subagent', 'btw')";
    }
    sql += " ORDER BY last_active_at DESC, created_at DESC";
    const rows = this.db.prepare(sql).all(...params) as SessionRow[];
    return rows.map(rowToSession);
  }

  children(parentId: number): SessionRow[] {
    const rows = this.db
      .prepare("SELECT * FROM sessions WHERE parent_id = ? ORDER BY created_at ASC")
      .all(parentId) as SessionRow[];
    return rows.map(rowToSession);
  }

  updateStatus(id: number, status: SessionStatus): void {
    const now = Date.now();
    this.db
      .prepare("UPDATE sessions SET status = ?, last_active_at = ? WHERE id = ?")
      .run(status, now, id);
    this.touchSessionActivityTree(id, now);
    for (const listener of this.statusListeners) {
      try {
        listener(id, status);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`session status listener failed [${id}]:`, message);
      }
    }
  }

  onSessionStatusChange(listener: (id: number, status: SessionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Bubble activity timestamp to parent sessions so project lists stay fresh. */
  touchSessionActivityTree(id: number, at = Date.now()): void {
    let current = this.get(id);
    while (current) {
      this.db
        .prepare("UPDATE sessions SET last_active_at = ? WHERE id = ?")
        .run(at, current.id);
      current = current.parent_id != null ? this.get(current.parent_id) : undefined;
    }
  }

  /** Normalize process-bound Session state after Supervisor starts. */
  reconcileInterruptedSessionStatuses(): number {
    // Transient busy / in-flight states → idle.
    // `blocked` with error_msg (e.g. missing model) is kept; empty blocked was approval wait.
    const normalized = this.db
      .prepare(
        `UPDATE sessions
         SET status = 'idle'
         WHERE status IN ('initializing', 'starting', 'running', 'waiting_user')
            OR (status = 'blocked' AND (error_msg IS NULL OR trim(error_msg) = ''))
            OR (status = 'needs_model' AND (error_msg IS NULL OR trim(error_msg) = ''))`,
      )
      .run().changes;
    this.db.exec(`
      UPDATE sessions SET status = 'blocked'
      WHERE status IN ('needs_model', 'waiting_user')
    `);
    return normalized;
  }

  updateThinkingLevel(id: number, thinkingLevel: "none" | "low" | "medium" | "high"): void {
    this.db
      .prepare("UPDATE sessions SET thinking_level = ?, last_active_at = ? WHERE id = ?")
      .run(thinkingLevel, Date.now(), id);
  }

  updateCwd(id: number, cwd: string): void {
    this.db
      .prepare("UPDATE sessions SET cwd = ?, last_active_at = ? WHERE id = ?")
      .run(cwd, Date.now(), id);
  }

  updateMeta(id: number, patch: Record<string, unknown>): Record<string, unknown> {
    const row = this.db.prepare("SELECT meta FROM sessions WHERE id = ?").get(id) as
      | { meta: string }
      | undefined;
    if (!row) throw new Error(`Session ${id} not found`);
    const merged = { ...JSON.parse(row.meta), ...patch };
    this.db
      .prepare("UPDATE sessions SET meta = ?, last_active_at = ? WHERE id = ?")
      .run(JSON.stringify(merged), Date.now(), id);
    return merged;
  }

  getSessionSubagentIds(sessionId: number): number[] {
    const session = this.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    const meta = session.meta as unknown;
    const value =
      meta && typeof meta === "object" && !Array.isArray(meta)
        ? (meta as Record<string, unknown>).subagentIds
        : undefined;
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is number => Number.isInteger(id)))]
      : [];
  }

  setSessionSubagentIds(sessionId: number, ids: number[]): void {
    this.updateMeta(sessionId, { subagentIds: [...new Set(ids.filter(Number.isInteger))] });
  }

  updateSessionFields(
    id: number,
    patch: {
      title?: string | null;
      systemPrompt?: string | null;
      avatar?: string | null;
      isBuiltin?: boolean;
      pinned?: boolean;
      muted?: boolean;
      unread?: number;
      externalSessionId?: string | null;
      errorMsg?: string | null;
      stage?: string | null;
      shadowEnabled?: boolean;
    },
  ): void {
    const sets: string[] = [];
    const params: unknown[] = [];
    const put = (column: string, value: unknown) => {
      sets.push(`${column} = ?`);
      params.push(value);
    };
    if (patch.title !== undefined) put("title", patch.title);
    if (patch.systemPrompt !== undefined) put("system_prompt", patch.systemPrompt);
    if (patch.avatar !== undefined) put("avatar", patch.avatar);
    if (patch.isBuiltin !== undefined) put("is_builtin", patch.isBuiltin ? 1 : 0);
    if (patch.pinned !== undefined) put("pinned", patch.pinned ? 1 : 0);
    if (patch.muted !== undefined) put("muted", patch.muted ? 1 : 0);
    if (patch.unread !== undefined) put("unread", patch.unread);
    if (patch.externalSessionId !== undefined) put("external_session_id", patch.externalSessionId);
    if (patch.errorMsg !== undefined) put("error_msg", patch.errorMsg);
    if (patch.stage !== undefined) put("stage", patch.stage);
    if (patch.shadowEnabled !== undefined) put("shadow_enabled", patch.shadowEnabled ? 1 : 0);
    if (sets.length === 0) return;
    sets.push("last_active_at = ?");
    params.push(Date.now(), id);
    this.db.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  }

  listSessionTasks(sessionId: number): SessionTaskRow[] {
    const meta = this.get(sessionId)?.meta;
    const tasks = meta && Array.isArray((meta as Record<string, unknown>).tasks)
      ? (meta as Record<string, unknown>).tasks
      : [];
    return tasks.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const task = item as { path?: unknown; kind?: unknown; title?: unknown; status?: unknown };
      if (typeof task.path !== "string") return [];
      return [{
        id: syntheticMetaId(task.path),
        session_id: sessionId,
        path: task.path,
        kind: task.kind === "plan" ? "plan" : "goal",
        title: typeof task.title === "string" ? task.title : null,
        status: typeof task.status === "string" ? task.status : null,
        created_at: index,
        updated_at: index,
      }];
    });
  }

  upsertSessionTask(row: {
    sessionId: number;
    path: string;
    kind: "goal" | "plan";
    title?: string | null;
    status?: string | null;
  }): SessionTaskRow {
    const tasks = this.listSessionTasks(row.sessionId);
    const existing = tasks.find((task) => task.path === row.path);
    const next = [
      ...tasks.filter((task) => task.path !== row.path).map(({ id, session_id, created_at, updated_at, ...task }) => task),
      {
        path: row.path,
        kind: row.kind,
        title: row.title ?? existing?.title ?? null,
        status: row.status ?? existing?.status ?? null,
      },
    ];
    this.updateMeta(row.sessionId, { tasks: next });
    return this.listSessionTasks(row.sessionId).find((task) => task.path === row.path)!;
  }

  deleteSessionTask(sessionId: number, path: string): boolean {
    const tasks = this.listSessionTasks(sessionId);
    if (!tasks.some((task) => task.path === path)) return false;
    const session = this.get(sessionId);
    const meta = session?.meta as Record<string, unknown>;
    this.updateMeta(sessionId, {
      tasks: tasks.filter((task) => task.path !== path).map(({ id, session_id, created_at, updated_at, ...task }) => task),
      ...(meta.currentTask === path ? { currentTask: null } : {}),
    });
    return true;
  }

  listSessionTodos(sessionId: number): SessionTodoRow[] {
    const meta = this.get(sessionId)?.meta as Record<string, unknown> | undefined;
    const todos = Array.isArray(meta?.todos) ? meta.todos : [];
    return todos.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const todo = item as { title?: unknown; status?: unknown };
      if (typeof todo.title !== "string") return [];
      return [{
        id: index + 1,
        session_id: sessionId,
        title: todo.title,
        status: normalizeTodoStatus(todo.status),
        sort_order: index,
        created_at: index,
        updated_at: index,
      }];
    });
  }

  replaceSessionTodos(
    sessionId: number,
    todos: Array<{ title: string; status: SessionTodoRow["status"] }>,
  ): SessionTodoRow[] {
    this.updateMeta(sessionId, {
      todos: todos.map((todo) => ({ title: todo.title, status: normalizeTodoStatus(todo.status) })),
    });
    return this.listSessionTodos(sessionId);
  }

  enqueueSessionInput(input: {
    id: string;
    sessionId: number;
    message: string;
    level: number;
    originMsg?: string;
    images?: unknown[];
    enqueuedAt: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO session_input_queue
         (id, session_id, message, level, origin_msg, images, enqueued_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.sessionId,
        input.message,
        input.level,
        input.originMsg ?? null,
        input.images ? JSON.stringify(input.images) : null,
        input.enqueuedAt,
      );
  }

  deleteSessionInput(id: string): void {
    this.db.prepare("DELETE FROM session_input_queue WHERE id = ?").run(id);
  }

  listPersistedSessionInputs(): Array<{
    id: string;
    sessionId: number;
    message: string;
    level: number;
    originMsg?: string;
    images?: unknown[];
    enqueuedAt: number;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, message, level, origin_msg, images, enqueued_at
         FROM session_input_queue
         ORDER BY level DESC, enqueued_at ASC`,
      )
      .all() as Array<{
      id: string;
      session_id: number;
      message: string;
      level: number;
      origin_msg: string | null;
      images: string | null;
      enqueued_at: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      message: row.message,
      level: row.level,
      ...(row.origin_msg ? { originMsg: row.origin_msg } : {}),
      ...(row.images ? { images: JSON.parse(row.images) as unknown[] } : {}),
      enqueuedAt: row.enqueued_at,
    }));
  }

  setMeta(id: number, meta: Record<string, unknown>): void {
    this.db
      .prepare("UPDATE sessions SET meta = ?, last_active_at = ? WHERE id = ?")
      .run(JSON.stringify(meta), Date.now(), id);
  }

  updateMessageMeta(
    sessionId: number,
    messageId: string,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const row = this.db
      .prepare("SELECT meta FROM messages WHERE entry_id = ? AND session_id = ?")
      .get(messageId, sessionId) as { meta: string } | undefined;
    if (!row) throw new Error(`Message ${messageId} not found in session ${sessionId}`);
    const merged = { ...JSON.parse(row.meta), ...patch };
    this.db
      .prepare("UPDATE messages SET meta = ? WHERE entry_id = ? AND session_id = ?")
      .run(JSON.stringify(merged), messageId, sessionId);
    return merged;
  }

  /** Mark all unread messages in a session as read. Returns how many were updated. */
  markSessionMessagesRead(sessionId: number): number {
    const rows = this.db
      .prepare(
        `SELECT entry_id, meta FROM messages
         WHERE session_id = ?
           AND json_extract(meta, '$.read') = 0`,
      )
      .all(sessionId) as Array<{ entry_id: string; meta: string }>;
    if (rows.length === 0) return 0;
    const update = this.db.prepare(
      "UPDATE messages SET meta = ? WHERE entry_id = ? AND session_id = ?",
    );
    const mark = this.db.transaction(() => {
      for (const row of rows) {
        const meta = { ...(JSON.parse(row.meta) as Record<string, unknown>), read: true };
        update.run(JSON.stringify(meta), row.entry_id, sessionId);
      }
    });
    mark();
    return rows.length;
  }

  setMessageMeta(sessionId: number, messageId: string, meta: Record<string, unknown>): void {
    const result = this.db
      .prepare("UPDATE messages SET meta = ? WHERE entry_id = ? AND session_id = ?")
      .run(JSON.stringify(meta), messageId, sessionId);
    if (result.changes === 0)
      throw new Error(`Message ${messageId} not found in session ${sessionId}`);
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  // ============ Agent Methods ============

  listAgents(): Agent[] {
    const rows = this.db
      .prepare(
        `SELECT agents.*, models.provider_id AS resolved_provider_id
         FROM agents LEFT JOIN models ON models.id = agents.model_id
         ORDER BY agents.created_at DESC`,
      )
      .all() as AgentRow[];
    return rows.map(rowToAgent);
  }

  getAgent(id: number): Agent | undefined {
    const row = this.db
      .prepare(
        `SELECT agents.*, models.provider_id AS resolved_provider_id
         FROM agents LEFT JOIN models ON models.id = agents.model_id
         WHERE agents.id = ?`,
      )
      .get(id) as
      | AgentRow
      | undefined;
    return row ? rowToAgent(row) : undefined;
  }

  insertAgent(row: {
    name: string;
    description?: string | null;
    avatar?: string | null;
    backend_type?: AgentBackendType;
    model_id?: number | null;
    system_prompt?: string | null;
    tools_preset?: string | null;
    home_dir?: string | null;
    is_builtin?: boolean;
    external_config?: AgentRow["external_config"];
    disabled_tools?: string | string[];
    meta?: string | Record<string, unknown>;
  }): Agent {
    const now = Date.now();
    const metaJson = typeof row.meta === "string" ? row.meta : JSON.stringify(row.meta ?? {});
    const homeDir = row.home_dir ?? undefined;
    const full = {
      created_at: now,
      updated_at: now,
      name: row.name,
      description: row.description ?? null,
      avatar: row.avatar ?? null,
      backend_type: row.backend_type ?? "native",
      model_id: row.model_id ?? null,
      system_prompt: row.system_prompt ?? null,
      tools_preset: row.tools_preset ?? "coding",
      home_dir: homeDir ?? null,
      is_builtin: row.is_builtin ? 1 : 0,
      external_config: row.external_config ?? null,
      disabled_tools: Array.isArray(row.disabled_tools)
        ? JSON.stringify(row.disabled_tools)
        : (row.disabled_tools ?? "[]"),
      meta: metaJson,
    };
    const result = this.db
      .prepare(
        `INSERT INTO agents (name, description, avatar, backend_type, model_id, system_prompt, tools_preset, home_dir, is_builtin, external_config, disabled_tools, meta, created_at, updated_at)
				 VALUES (@name, @description, @avatar, @backend_type, @model_id, @system_prompt, @tools_preset, @home_dir, @is_builtin, @external_config, @disabled_tools, @meta, @created_at, @updated_at)`,
      )
      .run(full);
    const id = Number(result.lastInsertRowid);
    if (full.backend_type === "native") {
      const resolvedHomeDir = homeDir ?? getAgentHomeDir(id);
      ensureAgentHome(id, resolvedHomeDir);
    }
    return rowToAgent({
      ...full,
      id,
      home_dir: homeDir ?? null,
      resolved_provider_id: null,
    } as AgentRow);
  }

  updateAgent(
    id: number,
    patch: Partial<
      Pick<
        AgentRow,
        | "name"
        | "description"
        | "avatar"
        | "backend_type"
        | "model_id"
        | "system_prompt"
        | "tools_preset"
        | "home_dir"
        | "is_builtin"
        | "external_config"
        | "disabled_tools"
      >
    > & {
      meta?: Record<string, unknown>;
    },
  ): Agent {
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [Date.now()];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (k === "meta") {
        sets.push("meta = ?");
        params.push(JSON.stringify(v ?? {}));
      } else {
        sets.push(`${k} = ?`);
        params.push(v);
      }
    }
    params.push(id);
    this.db.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    const updated = this.getAgent(id);
    if (!updated) throw new Error(`Agent ${id} not found`);
    return updated;
  }

  updateAgentMeta(id: number, patch: Record<string, unknown>): Record<string, unknown> {
    const row = this.db.prepare("SELECT meta FROM agents WHERE id = ?").get(id) as
      | { meta: string }
      | undefined;
    if (!row) throw new Error(`Agent ${id} not found`);
    const merged = { ...JSON.parse(row.meta), ...patch };
    this.db
      .prepare("UPDATE agents SET meta = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(merged), Date.now(), id);
    return merged;
  }

  setAgentMeta(id: number, meta: Record<string, unknown>): void {
    this.db
      .prepare("UPDATE agents SET meta = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(meta), Date.now(), id);
  }

  getMessageRows(sessionId: number): MessageRow[] {
    return this.db
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as MessageRow[];
  }

  getMessageRowByEntryId(sessionId: number, entryId: string): MessageRow | undefined {
    return this.db
      .prepare("SELECT * FROM messages WHERE session_id = ? AND entry_id = ?")
      .get(sessionId, entryId) as MessageRow | undefined;
  }

  /**
   * Newest-first page by monotonic row id. Caller should reverse for chronological UI.
   * `beforeId` excludes that row and older pages use smaller ids.
   */
  getMessageRowsPage(
    sessionId: number,
    options?: { beforeId?: number; limit?: number },
  ): MessageRow[] {
    const limit = Math.max(1, Math.min(options?.limit ?? 80, 500));
    if (options?.beforeId != null) {
      return this.db
        .prepare(
          `SELECT * FROM messages
           WHERE session_id = ? AND id < ?
           ORDER BY id DESC
           LIMIT ?`,
        )
        .all(sessionId, options.beforeId, limit) as MessageRow[];
    }
    return this.db
      .prepare(
        `SELECT * FROM messages
         WHERE session_id = ?
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(sessionId, limit) as MessageRow[];
  }

  /** Count whether any older row exists before the given id. */
  hasOlderMessages(sessionId: number, beforeId: number): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 AS ok FROM messages WHERE session_id = ? AND id < ? LIMIT 1`,
      )
      .get(sessionId, beforeId) as { ok: number } | undefined;
    return !!row;
  }

  searchMessages(
    query: string,
    filter?: { sessionId?: string; role?: string; limit?: number },
  ): MessageSearchHit[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const ftsQuery = trimmed
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term.replace(/"/g, '""')}"`)
      .join(" ");

    let sql = `
			SELECT m.entry_id, m.session_id, m.role, m.search_text, m.is_old, m.created_at
			FROM messages_fts f
			INNER JOIN messages m ON m.entry_id = f.message_id
			WHERE messages_fts MATCH ?
		`;
    const params: unknown[] = [ftsQuery];
    if (filter?.sessionId) {
      sql += " AND m.session_id = ?";
      params.push(filter.sessionId);
    }
    if (filter?.role) {
      sql += " AND m.role = ?";
      params.push(filter.role);
    }
    sql += " ORDER BY m.created_at DESC LIMIT ?";
    params.push(filter?.limit ?? 50);

    const rows = this.db.prepare(sql).all(...params) as Array<{
      entry_id: string;
      session_id: number;
      role: string | null;
      search_text: string | null;
      is_old: number;
      created_at: number;
    }>;

    return rows.map((row) => ({
      messageId: row.entry_id,
      sessionId: row.session_id,
      role: row.role,
      searchText: row.search_text,
      isOld: row.is_old === 1,
      createdAt: row.created_at,
      snippet: snippetFromSearchText(row.search_text, trimmed),
    }));
  }

  private ensureMessageFts(): void {
    this.db.exec(`
			CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
				search_text,
				role,
				session_id UNINDEXED,
				message_id UNINDEXED,
				tokenize='unicode61 remove_diacritics 2'
			);
		`);
    this.db.exec(`
			CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages
			WHEN NEW.search_text IS NOT NULL AND NEW.search_text != ''
			BEGIN
				INSERT INTO messages_fts(search_text, role, session_id, message_id)
				VALUES (NEW.search_text, NEW.role, NEW.session_id, NEW.entry_id);
			END;
		`);
    this.db.exec(`
			CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
				DELETE FROM messages_fts WHERE message_id = OLD.entry_id;
			END;
		`);
    this.db.exec(`
			CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE OF search_text, role ON messages BEGIN
				DELETE FROM messages_fts WHERE message_id = OLD.entry_id;
				INSERT INTO messages_fts(search_text, role, session_id, message_id)
				SELECT NEW.search_text, NEW.role, NEW.session_id, NEW.entry_id
				WHERE NEW.search_text IS NOT NULL AND NEW.search_text != '';
			END;
			INSERT INTO messages_fts(search_text, role, session_id, message_id)
			SELECT search_text, role, session_id, entry_id FROM messages
			WHERE search_text IS NOT NULL AND search_text != '';
		`);
  }

  deleteAgent(id: number): void {
    this.db.prepare("DELETE FROM agents WHERE id = ?").run(id);
  }

  // ============ Provider Methods ============

  listProviders(): Provider[] {
    const rows = this.db
      .prepare("SELECT * FROM providers ORDER BY created_at ASC")
      .all() as ProviderRow[];
    return rows.map(rowToProvider);
  }

  getProvider(id: number): Provider | undefined {
    const row = this.db.prepare("SELECT * FROM providers WHERE id = ?").get(id) as
      | ProviderRow
      | undefined;
    return row ? rowToProvider(row) : undefined;
  }

  insertProvider(row: {
    slug?: string | null;
    name: string;
    icon?: string | null;
    api_type: string;
    base_url?: string | null;
    api_key?: string | null;
    is_enabled?: number;
  }): number {
    const now = Date.now();
    const result = this.db
      .prepare(
        `INSERT INTO providers (slug, name, icon, api_type, base_url, api_key, is_enabled, created_at, updated_at)
				 VALUES (@slug, @name, @icon, @api_type, @base_url, @api_key, @is_enabled, @created_at, @updated_at)`,
      )
      .run({
        ...row,
        slug: row.slug ?? null,
        icon: row.icon ?? null,
        base_url: row.base_url ?? null,
        api_key: row.api_key ? encryptApiKey(row.api_key) : null,
        is_enabled: row.is_enabled ?? 1,
        created_at: now,
        updated_at: now,
      });
    return Number(result.lastInsertRowid);
  }

  updateProvider(
    id: number,
    patch: Partial<{
      slug: string | null;
      name: string;
      icon: string | null;
      api_type: string;
      base_url: string | null;
      api_key: string | null;
      is_enabled: number;
    }>,
  ): void {
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [Date.now()];
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = ?`);
      params.push(k === "api_key" && typeof v === "string" && v ? encryptApiKey(v) : v);
    }
    params.push(id);
    this.db.prepare(`UPDATE providers SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  }

  deleteProvider(id: number): void {
    this.db.prepare("DELETE FROM models WHERE provider_id = ?").run(id);
    this.db.prepare("DELETE FROM providers WHERE id = ?").run(id);
  }

  // ============ Model Methods ============

  listModels(): Model[] {
    const rows = this.db.prepare("SELECT * FROM models").all() as ModelRow[];
    return rows.map(rowToModel);
  }

  insertModel(row: {
    provider_id: number;
    model_id: string;
    name?: string | null;
    context_window?: number;
    supports_vision?: number;
  }): Model {
    const now = Date.now();
    const full = {
      provider_id: row.provider_id,
      model_id: row.model_id,
      name: row.name ?? row.model_id,
      context_window: row.context_window ?? 128000,
      supports_vision: row.supports_vision ?? 0,
      created_at: now,
      updated_at: now,
    };
    const result = this.db
      .prepare(
        `INSERT INTO models (provider_id, model_id, name, context_window, supports_vision, created_at, updated_at)
			 VALUES (@provider_id, @model_id, @name, @context_window, @supports_vision, @created_at, @updated_at)`,
      )
      .run(full);
    return rowToModel({ ...full, id: Number(result.lastInsertRowid) } as ModelRow);
  }

  getModel(providerId: number, modelId: string): Model | undefined {
    const row = this.db
      .prepare("SELECT * FROM models WHERE provider_id = ? AND model_id = ?")
      .get(providerId, modelId) as ModelRow | undefined;
    return row ? rowToModel(row) : undefined;
  }

  getModelById(id: number): Model | undefined {
    const row = this.db.prepare("SELECT * FROM models WHERE id = ?").get(id) as
      | ModelRow
      | undefined;
    return row ? rowToModel(row) : undefined;
  }

  updateModel(
    providerId: number,
    modelId: string,
    patch: Partial<{
      name: string | null;
      context_window: number;
      supports_vision: number;
    }>,
  ): Model {
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [Date.now()];
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
    params.push(providerId, modelId);
    const result = this.db
      .prepare(`UPDATE models SET ${sets.join(", ")} WHERE provider_id = ? AND model_id = ?`)
      .run(...params);
    if (result.changes === 0)
      throw new Error(`Model ${modelId} not found for provider ${providerId}`);
    const updated = this.getModel(providerId, modelId);
    if (!updated) throw new Error(`Model ${modelId} not found for provider ${providerId}`);
    return updated;
  }

  listModelsByProvider(providerId: number): Model[] {
    const rows = this.db
      .prepare("SELECT * FROM models WHERE provider_id = ? ORDER BY created_at ASC")
      .all(providerId) as ModelRow[];
    return rows.map(rowToModel);
  }

  deleteModel(providerId: number, modelId: string): void {
    const model = this.getModel(providerId, modelId);
    if (!model) return;
    const agents = this.db
      .prepare("SELECT name FROM agents WHERE model_id = ?")
      .all(model.id) as Array<{ name: string }>;
    if (agents.length > 0) {
      const names = agents.map((agent) => agent.name).join(", ");
      throw new Error(`Model "${modelId}" is in use by agent(s): ${names}`);
    }
    this.db
      .prepare("DELETE FROM models WHERE provider_id = ? AND model_id = ?")
      .run(providerId, modelId);
  }

  getLastMessagePreview(sessionId: number): string | null {
    const row = this.db
      .prepare(
        `SELECT search_text FROM messages
				 WHERE session_id = ? AND search_text IS NOT NULL AND search_text != ''
				 ORDER BY created_at DESC LIMIT 1`,
      )
      .get(sessionId) as { search_text: string } | undefined;
    return row?.search_text ?? null;
  }

  close(): void {
    this.db.close();
  }

  initializeDefaultProviders(): void {
    const existing = this.db.prepare("SELECT id FROM providers").all() as Array<{ id: number }>;
    if (existing.length > 0) return;

    // Optional: auto-create a default provider from env
    const slug = process.env.SS_PROVIDER_ID;
    if (!slug) return;

    const name = process.env.SS_PROVIDER_NAME || slug;
    const apiType = process.env.SS_PROVIDER_API_TYPE || "anthropic-messages";
    const baseUrl = process.env.SS_PROVIDER_BASE_URL || null;
    const apiKey = process.env.SS_PROVIDER_API_KEY || null;
    const icon = process.env.SS_PROVIDER_ICON || null;

    const id = this.insertProvider({
      slug: slug,
      name: name,
      api_type: apiType,
      base_url: baseUrl,
      api_key: apiKey,
      icon: icon,
    });

    console.log(`Initialized default provider: ${name} (${slug}, id=${id})`);
  }

  // ============ Resource catalog ============

  upsertResource(row: {
    kind: ResourceKind;
    slug: string;
    name?: string | null;
    description?: string | null;
    source_path?: string | null;
    version?: string | null;
    meta?: Record<string, unknown>;
  }): Resource {
    const existing = this.getResourceByKindSlug(row.kind, row.slug);
    const now = Date.now();
    if (existing) {
      return this.updateResource(existing.id, {
        name: row.name ?? existing.name,
        description: row.description ?? existing.description,
        source_path: row.source_path ?? existing.sourcePath,
        version: row.version ?? existing.version,
        meta: row.meta ?? existing.meta,
      });
    }
    const metaJson = JSON.stringify(row.meta ?? {});
    const result = this.db
      .prepare(
        `INSERT INTO resources (kind, slug, name, description, source_path, version, meta, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.kind,
        row.slug,
        row.name ?? row.slug,
        row.description ?? null,
        row.source_path ?? null,
        row.version ?? null,
        metaJson,
        now,
        now,
      );
    return rowToResource(
      this.db
        .prepare("SELECT * FROM resources WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as ResourceRow,
    );
  }

  updateResource(
    id: number,
    patch: Partial<{
      name: string | null;
      description: string | null;
      source_path: string | null;
      version: string | null;
      meta: Record<string, unknown>;
    }>,
  ): Resource {
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [Date.now()];
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (key === "meta") {
        sets.push("meta = ?");
        params.push(JSON.stringify(value ?? {}));
      } else {
        sets.push(`${key} = ?`);
        params.push(value);
      }
    }
    params.push(id);
    this.db.prepare(`UPDATE resources SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    const row = this.db.prepare("SELECT * FROM resources WHERE id = ?").get(id) as
      | ResourceRow
      | undefined;
    if (!row) throw new Error(`Resource ${id} not found`);
    return rowToResource(row);
  }

  getResource(id: number): Resource | undefined {
    const row = this.db.prepare("SELECT * FROM resources WHERE id = ?").get(id) as
      | ResourceRow
      | undefined;
    return row ? rowToResource(row) : undefined;
  }

  getResourceByKindSlug(kind: ResourceKind, slug: string): Resource | undefined {
    const row = this.db
      .prepare("SELECT * FROM resources WHERE kind = ? AND slug = ?")
      .get(kind, slug) as ResourceRow | undefined;
    return row ? rowToResource(row) : undefined;
  }

  listResources(kind?: ResourceKind): Resource[] {
    const rows = kind
      ? (this.db
          .prepare("SELECT * FROM resources WHERE kind = ? ORDER BY slug")
          .all(kind) as ResourceRow[])
      : (this.db.prepare("SELECT * FROM resources ORDER BY kind, slug").all() as ResourceRow[]);
    return rows.map(rowToResource);
  }

  deleteResource(id: number): void {
    const refs = this.db
      .prepare("SELECT COUNT(*) AS count FROM agent_resources WHERE resource_id = ?")
      .get(id) as { count: number };
    if (refs.count > 0) {
      throw new Error(`Resource ${id} is still bound to ${refs.count} agent(s)`);
    }
    this.db.prepare("DELETE FROM resources WHERE id = ?").run(id);
  }

  bindAgentResource(
    agentId: number,
    resourceId: number,
    options?: { priority?: number },
  ): AgentResourceBinding {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO agent_resources (agent_id, resource_id, enabled, priority, created_at)
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT(agent_id, resource_id) DO UPDATE SET enabled = 1, priority = excluded.priority`,
      )
      .run(agentId, resourceId, options?.priority ?? 0, now);
    const row = this.db
      .prepare("SELECT * FROM agent_resources WHERE agent_id = ? AND resource_id = ?")
      .get(agentId, resourceId) as AgentResourceRow;
    return this.rowToAgentResourceBinding(row);
  }

  /** Insert binding if missing; never changes an existing enabled flag. */
  ensureAgentResourceBinding(
    agentId: number,
    resourceId: number,
    options?: { enabled?: boolean; priority?: number },
  ): AgentResourceBinding {
    const existing = this.getAgentResourceBinding(agentId, resourceId);
    if (existing) return existing;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO agent_resources (agent_id, resource_id, enabled, priority, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        agentId,
        resourceId,
        options?.enabled === false ? 0 : 1,
        options?.priority ?? 0,
        now,
      );
    return this.getAgentResourceBinding(agentId, resourceId)!;
  }

  getAgentResourceBinding(agentId: number, resourceId: number): AgentResourceBinding | undefined {
    const row = this.db
      .prepare("SELECT * FROM agent_resources WHERE agent_id = ? AND resource_id = ?")
      .get(agentId, resourceId) as AgentResourceRow | undefined;
    return row ? this.rowToAgentResourceBinding(row, true) : undefined;
  }

  setAgentResourceEnabled(
    agentId: number,
    resourceId: number,
    enabled: boolean,
  ): AgentResourceBinding {
    const existing = this.getAgentResourceBinding(agentId, resourceId);
    if (!existing) throw new Error(`Binding not found for agent ${agentId} resource ${resourceId}`);
    this.db
      .prepare("UPDATE agent_resources SET enabled = ? WHERE agent_id = ? AND resource_id = ?")
      .run(enabled ? 1 : 0, agentId, resourceId);
    return this.getAgentResourceBinding(agentId, resourceId)!;
  }

  unbindAgentResource(agentId: number, resourceId: number): void {
    this.db
      .prepare("DELETE FROM agent_resources WHERE agent_id = ? AND resource_id = ?")
      .run(agentId, resourceId);
  }

  unbindAgentResourceBySlug(agentId: number, kind: ResourceKind, slug: string): void {
    const resource = this.getResourceByKindSlug(kind, slug);
    if (!resource) return;
    this.unbindAgentResource(agentId, resource.id);
  }

  // ============ Home Tasks ============

  listHomeTasks(options?: { parentId?: number | null; projectId?: number }): HomeTask[] {
    let rows: HomeTaskRow[];
    if (options?.parentId === null) {
      rows = this.db
        .prepare(
          "SELECT * FROM home_tasks WHERE parent_id IS NULL ORDER BY updated_at DESC, id DESC",
        )
        .all() as HomeTaskRow[];
    } else if (typeof options?.parentId === "number") {
      rows = this.db
        .prepare(
          "SELECT * FROM home_tasks WHERE parent_id = ? ORDER BY created_at ASC, id ASC",
        )
        .all(options.parentId) as HomeTaskRow[];
    } else if (typeof options?.projectId === "number") {
      rows = this.db
        .prepare(
          "SELECT * FROM home_tasks WHERE project_id = ? ORDER BY updated_at DESC, id DESC",
        )
        .all(options.projectId) as HomeTaskRow[];
    } else {
      rows = this.db
        .prepare("SELECT * FROM home_tasks ORDER BY updated_at DESC, id DESC")
        .all() as HomeTaskRow[];
    }
    return rows.map(rowToHomeTask);
  }

  getHomeTask(id: number): HomeTask | undefined {
    const row = this.db.prepare("SELECT * FROM home_tasks WHERE id = ?").get(id) as
      | HomeTaskRow
      | undefined;
    return row ? rowToHomeTask(row) : undefined;
  }

  getHomeTaskBySessionId(sessionId: number): HomeTask | undefined {
    const row = this.db
      .prepare("SELECT * FROM home_tasks WHERE session_id = ? ORDER BY id DESC LIMIT 1")
      .get(sessionId) as HomeTaskRow | undefined;
    return row ? rowToHomeTask(row) : undefined;
  }

  insertHomeTask(options: CreateHomeTaskOptions): HomeTask {
    const title = options.title.trim();
    if (!title) throw new Error("title is required");
    const now = Date.now();
    const result = this.db
      .prepare(
        `INSERT INTO home_tasks (
          title, description, project_id, status, priority, parent_id, session_id, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        title,
        options.description?.trim() ?? "",
        options.projectId ?? null,
        options.status ?? "todo",
        options.priority ?? "normal",
        options.parentId ?? null,
        options.sessionId ?? null,
        now,
        now,
      );
    return this.getHomeTask(Number(result.lastInsertRowid))!;
  }

  updateHomeTask(id: number, patch: UpdateHomeTaskOptions): HomeTask {
    const current = this.getHomeTask(id);
    if (!current) throw new Error(`Home task ${id} not found`);
    const next = {
      title: patch.title !== undefined ? patch.title.trim() : current.title,
      description: patch.description !== undefined ? patch.description : current.description,
      project_id: patch.projectId !== undefined ? patch.projectId : current.projectId,
      status: patch.status ?? current.status,
      priority: patch.priority ?? current.priority,
      parent_id: patch.parentId !== undefined ? patch.parentId : current.parentId,
      session_id: patch.sessionId !== undefined ? patch.sessionId : current.sessionId,
      error: patch.error !== undefined ? patch.error : current.error,
      updated_at: Date.now(),
    };
    if (!next.title) throw new Error("title is required");
    this.db
      .prepare(
        `UPDATE home_tasks SET
          title = ?, description = ?, project_id = ?, status = ?, priority = ?,
          parent_id = ?, session_id = ?, error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.title,
        next.description,
        next.project_id,
        next.status,
        next.priority,
        next.parent_id,
        next.session_id,
        next.error,
        next.updated_at,
        id,
      );
    return this.getHomeTask(id)!;
  }

  deleteHomeTask(id: number): boolean {
    return this.db.prepare("DELETE FROM home_tasks WHERE id = ?").run(id).changes > 0;
  }

  listHomeTaskChildren(parentId: number): HomeTask[] {
    return this.listHomeTasks({ parentId });
  }

  listAgentResources(agentId: number, kind?: ResourceKind): AgentResourceBinding[] {
    return this.listAgentResourceBindings(agentId, { kind, enabledOnly: true });
  }

  /** List bindings; by default only enabled. Pass enabledOnly:false for management UIs. */
  listAgentResourceBindings(
    agentId: number,
    options?: { kind?: ResourceKind; enabledOnly?: boolean },
  ): AgentResourceBinding[] {
    const enabledOnly = options?.enabledOnly !== false;
    const kind = options?.kind;
    const enabledClause = enabledOnly ? "AND ar.enabled = 1" : "";
    const sql = kind
      ? `SELECT ar.* FROM agent_resources ar
         INNER JOIN resources r ON r.id = ar.resource_id
         WHERE ar.agent_id = ? AND r.kind = ? ${enabledClause}
         ORDER BY ar.priority DESC, r.slug`
      : `SELECT ar.* FROM agent_resources ar
         INNER JOIN resources r ON r.id = ar.resource_id
         WHERE ar.agent_id = ? ${enabledClause}
         ORDER BY r.kind, ar.priority DESC, r.slug`;
    const rows = kind
      ? (this.db.prepare(sql).all(agentId, kind) as AgentResourceRow[])
      : (this.db.prepare(sql).all(agentId) as AgentResourceRow[]);
    return rows.map((row) => this.rowToAgentResourceBinding(row, true));
  }

  listAgentResourceSlugs(agentId: number, kind: ResourceKind): string[] {
    return this.listAgentResources(agentId, kind)
      .map((binding) => binding.resource?.slug)
      .filter((slug): slug is string => Boolean(slug));
  }

  private rowToAgentResourceBinding(
    row: AgentResourceRow,
    withResource = false,
  ): AgentResourceBinding {
    const binding: AgentResourceBinding = {
      id: row.id,
      agentId: row.agent_id,
      resourceId: row.resource_id,
      enabled: Boolean(row.enabled),
      priority: row.priority,
      createdAt: new Date(row.created_at),
    };
    if (withResource) {
      binding.resource = this.getResource(row.resource_id);
    }
    return binding;
  }
}

function snippetFromSearchText(text: string | null, query: string): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let idx = -1;
  for (const term of terms) {
    const found = lower.indexOf(term);
    if (found !== -1) {
      idx = found;
      break;
    }
  }
  if (idx === -1) {
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + 80);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return prefix + text.slice(start, end).replace(/\s+/g, " ").trim() + suffix;
}
