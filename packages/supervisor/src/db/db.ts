import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ensureAgentHome, getAgentHomeDir } from "../agent/index.js";
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
  Member,
  MemberAgent,
  MemberRow,
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
} from "../types.js";
import { getProjectDir } from "../core/session-files.js";

const DEFAULT_DB_PATH = join(homedir(), ".pi", "supervisor.db");

function rowToSession(row: SessionRow): SessionRow {
  return {
    ...row,
    branch_type: row.branch_type === "spawn" ? "subagent" : row.branch_type,
    created_via:
      row.created_via ??
      (row.branch_type === "subagent" || row.branch_type === "spawn"
        ? "spawn_agent"
        : (row.branch_type ?? "user")),
    show_in_session_list: row.show_in_session_list ?? 1,
    context_leaf_id: row.context_leaf_id ?? null,
    meta: JSON.parse(row.meta) as any,
  };
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    cwd: row.cwd,
    workDir: row.work_dir,
    defaultBranch: row.default_branch,
    meta: JSON.parse(row.meta),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    providerId: row.provider_id,
    backendType: row.backend_type ?? "native",
    modelId: row.model_id,
    toolsPreset: (row.tools_preset as "coding" | "readonly" | "none") || null,
    homeDir: row.home_dir ?? null,
    isInternal: Boolean(row.is_internal),
    meta: JSON.parse(row.meta),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    icon: row.icon,
    apiType: row.api_type,
    baseUrl: row.base_url,
    apiKey: row.api_key ? decryptApiKey(row.api_key) : null,
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

function parseMemberTags(tags: string | null | undefined): string[] {
  return (tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function serializeMemberTags(tags: string[] | string | undefined): string {
  if (typeof tags === "string") return parseMemberTags(tags).join(",");
  return (tags ?? [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(",");
}

function rowToMember(row: MemberRow): Member {
  return {
    id: row.id,
    sessionId: row.session_id,
    agentId: row.agent_id,
    role: row.role,
    tags: parseMemberTags(row.tags),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function parseModelTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function rowToModel(row: ModelRow): Model {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    name: row.name,
    contextWindow: row.context_window,
    maxTokens: row.max_tokens,
    supportsMultimodal: Boolean(row.supports_multimodal),
    tags: parseModelTags(row.tags),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class SupervisorDb {
  public readonly db: Database.Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    mkdirSync(join(dbPath, ".."), { recursive: true });
    this.db = new Database(dbPath);
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
				max_tokens    INTEGER NOT NULL DEFAULT 16384,
				supports_multimodal INTEGER NOT NULL DEFAULT 0,
				tags          TEXT NOT NULL DEFAULT '[]',
				created_at    INTEGER NOT NULL,
				updated_at    INTEGER NOT NULL,
				UNIQUE (provider_id, model_id)
			);

			CREATE TABLE IF NOT EXISTS agents (
				id            INTEGER PRIMARY KEY AUTOINCREMENT,
				name          TEXT NOT NULL,
				description   TEXT,
				icon          TEXT,
				provider_id   INTEGER REFERENCES providers(id) ON DELETE SET NULL,
				backend_type  TEXT NOT NULL DEFAULT 'native',
				system_prompt TEXT,
				tools_preset  TEXT,
				extension_id  TEXT UNIQUE,
				model_id      TEXT,
				home_dir      TEXT,
				is_internal   INTEGER NOT NULL DEFAULT 0,
				meta          TEXT NOT NULL DEFAULT '{}',
				created_at    INTEGER NOT NULL,
				updated_at    INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS projects (
				id            INTEGER PRIMARY KEY AUTOINCREMENT,
				name          TEXT NOT NULL,
				cwd           TEXT NOT NULL UNIQUE,
				work_dir      TEXT NOT NULL,
				default_branch TEXT NOT NULL DEFAULT 'main',
				meta          TEXT NOT NULL DEFAULT '{}',
				created_at    INTEGER NOT NULL,
				updated_at    INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS sessions (
				id            INTEGER PRIMARY KEY AUTOINCREMENT,
				project_id    INTEGER REFERENCES projects(id) ON DELETE CASCADE,
				parent_id     INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
				session_id    TEXT,
				pid           INTEGER,
				status        TEXT NOT NULL DEFAULT 'starting',
				thinking_level TEXT NOT NULL DEFAULT 'none',
				cwd           TEXT NOT NULL DEFAULT '',
				leaf_id       TEXT,
				agent_id      INTEGER REFERENCES agents(id) ON DELETE SET NULL,
				branch_type   TEXT,
				created_via  TEXT NOT NULL DEFAULT 'user',
				show_in_session_list INTEGER NOT NULL DEFAULT 1,
				context_leaf_id TEXT,
				created_at    INTEGER NOT NULL,
				last_active_at INTEGER NOT NULL,
				meta          TEXT NOT NULL DEFAULT '{}'
			);
			CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id);
			CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
			CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
			CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);

      CREATE TABLE IF NOT EXISTS members (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        agent_id      INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        role          TEXT NOT NULL DEFAULT 'member',
        tags          TEXT NOT NULL DEFAULT '',
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        UNIQUE(session_id, agent_id)
      );
      CREATE INDEX IF NOT EXISTS idx_members_session ON members(session_id);
      CREATE INDEX IF NOT EXISTS idx_members_agent ON members(agent_id);
		`);

    this.ensureProjectColumns();
    this.ensureSessionChildColumns();

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
        source        TEXT,
        origin        TEXT,
        message_role  TEXT,
        search_text   TEXT,
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session_role ON messages(session_id, message_role);
      CREATE INDEX IF NOT EXISTS idx_messages_search_text ON messages(search_text) WHERE search_text IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_members_session ON members(session_id);
      CREATE INDEX IF NOT EXISTS idx_members_agent ON members(agent_id);
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
    this.ensureMessageColumns();
    this.ensureMessageFts();

    // Initialize default providers from environment variables
    this.initializeDefaultProviders();
  }

  private ensureProjectColumns(): void {
    const columns = this.db.pragma("table_info(projects)") as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "default_branch")) {
      this.db.exec("ALTER TABLE projects ADD COLUMN default_branch TEXT NOT NULL DEFAULT 'main'");
    }
  }

  private ensureSessionChildColumns(): void {
    const columns = this.db.pragma("table_info(sessions)") as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("show_in_session_list")) {
      this.db.exec(
        "ALTER TABLE sessions ADD COLUMN show_in_session_list INTEGER NOT NULL DEFAULT 1",
      );
      this.db.exec(`
        UPDATE sessions
        SET show_in_session_list = CASE
          WHEN parent_id IS NULL OR branch_type IN ('fork', 'clone') THEN 1
          ELSE 0
        END
      `);
    }
    if (!names.has("context_leaf_id")) {
      this.db.exec("ALTER TABLE sessions ADD COLUMN context_leaf_id TEXT");
    }
    if (!names.has("created_via")) {
      this.db.exec("ALTER TABLE sessions ADD COLUMN created_via TEXT NOT NULL DEFAULT 'user'");
      this.db.exec(`UPDATE sessions SET created_via = CASE
        WHEN branch_type = 'subagent' OR branch_type = 'spawn' THEN 'spawn_agent'
        WHEN branch_type IN ('btw', 'fork', 'clone') THEN branch_type
        ELSE 'user' END`);
      this.db.exec(`UPDATE sessions SET show_in_session_list = 1
        WHERE parent_id IS NOT NULL AND (branch_type = 'subagent' OR branch_type = 'spawn')`);
    }
    this.db.exec(`
      UPDATE sessions
      SET branch_type = 'subagent'
      WHERE branch_type = 'spawn';
    `);
  }

  private ensureMessageColumns(): void {
    const columns = this.db.pragma("table_info(messages)") as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "origin")) {
      this.db.exec("ALTER TABLE messages ADD COLUMN origin TEXT");
    }
  }

  private projectNameFromCwd(cwd: string): string {
    return cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "Project";
  }

  // ============ Project Methods ============

  findOrCreateProjectByCwd(
    cwd: string,
    options?: { name?: string; meta?: Record<string, unknown> },
  ): Project {
    const existing = this.db.prepare("SELECT * FROM projects WHERE cwd = ?").get(cwd) as
      | ProjectRow
      | undefined;
    if (existing) return rowToProject(existing);

    const now = Date.now();
    const result = this.db
      .prepare(
        `INSERT INTO projects (name, cwd, work_dir, default_branch, meta, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        options?.name ?? this.projectNameFromCwd(cwd),
        cwd,
        "",
        "main",
        JSON.stringify(options?.meta ?? {}),
        now,
        now,
      );
    const id = Number(result.lastInsertRowid);
    const workDir = getProjectDir(id);
    mkdirSync(workDir, { recursive: true });
    this.db.prepare("UPDATE projects SET work_dir = ? WHERE id = ?").run(workDir, id);
    return this.getProject(id)!;
  }

  insertProject(row: { name?: string; cwd: string; meta?: Record<string, unknown> }): Project {
    return this.findOrCreateProjectByCwd(row.cwd, { name: row.name, meta: row.meta });
  }

  updateProjectDefaultBranch(id: number, branch: string): void {
    this.db
      .prepare("UPDATE projects SET default_branch = ?, updated_at = ? WHERE id = ?")
      .run(branch, Date.now(), id);
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

  updateProjectMeta(id: number, patch: Record<string, unknown>): Record<string, unknown> {
    const project = this.getProject(id);
    if (!project) throw new Error(`Project ${id} not found`);
    const meta = { ...project.meta, ...patch };
    this.db
      .prepare("UPDATE projects SET meta = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(meta), Date.now(), id);
    return meta;
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
      | "branch_type"
      | "created_via"
      | "show_in_session_list"
      | "context_leaf_id"
      | "thinking_level"
    > & {
      created_at?: number;
      last_active_at?: number;
      leaf_id?: string | null;
      agent_id?: number | null;
      branch_type?: SessionBranchType | null;
      created_via?: SessionRow["created_via"];
      show_in_session_list?: number;
      context_leaf_id?: string | null;
      thinking_level?: "none" | "low" | "medium" | "high";
    },
  ): SessionRow {
    const now = Date.now();
    const full: SessionRow = {
      project_id: row.project_id ?? null,
      parent_id: row.parent_id ?? null,
      session_id: row.session_id ?? null,
      pid: row.pid ?? null,
      status: row.status ?? "starting",
      cwd: row.cwd ?? "",
      meta: typeof row.meta === "string" ? row.meta : JSON.stringify(row.meta ?? {}),
      created_at: now,
      last_active_at: now,
      leaf_id: row.leaf_id ?? null,
      agent_id: row.agent_id ?? null,
      branch_type: row.branch_type ?? null,
      created_via: row.created_via ?? "user",
      show_in_session_list: row.show_in_session_list ?? 1,
      context_leaf_id: row.context_leaf_id ?? null,
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
        `INSERT INTO sessions (project_id, parent_id, session_id, pid, status, thinking_level, cwd, leaf_id, agent_id, branch_type, created_via, show_in_session_list, context_leaf_id, created_at, last_active_at, meta)
				 VALUES (@project_id, @parent_id, @session_id, @pid, @status, @thinking_level, @cwd, @leaf_id, @agent_id, @branch_type, @created_via, @show_in_session_list, @context_leaf_id, @created_at, @last_active_at, @meta)`,
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
      sql += " AND show_in_session_list = ?";
      params.push(filter.showInSessionList ? 1 : 0);
    }
    sql += " ORDER BY created_at DESC";
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
    this.db
      .prepare("UPDATE sessions SET status = ?, last_active_at = ? WHERE id = ?")
      .run(status, Date.now(), id);
  }

  updateSessionListVisibility(id: number, visible: boolean): void {
    this.db
      .prepare("UPDATE sessions SET show_in_session_list = ?, last_active_at = ? WHERE id = ?")
      .run(visible ? 1 : 0, Date.now(), id);
  }

  updateThinkingLevel(id: number, thinkingLevel: "none" | "low" | "medium" | "high"): void {
    this.db
      .prepare("UPDATE sessions SET thinking_level = ?, last_active_at = ? WHERE id = ?")
      .run(thinkingLevel, Date.now(), id);
  }

  updatePid(id: number, pid: number): void {
    this.db
      .prepare("UPDATE sessions SET pid = ?, last_active_at = ? WHERE id = ?")
      .run(pid, Date.now(), id);
  }

  updateSessionId(id: number, sessionId: string): void {
    this.db
      .prepare("UPDATE sessions SET session_id = ?, last_active_at = ? WHERE id = ?")
      .run(sessionId, Date.now(), id);
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
      .prepare("SELECT * FROM agents ORDER BY created_at DESC")
      .all() as AgentRow[];
    return rows.map(rowToAgent);
  }

  getAgent(id: number): Agent | undefined {
    const row = this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as
      | AgentRow
      | undefined;
    return row ? rowToAgent(row) : undefined;
  }

  insertAgent(row: {
    name: string;
    description?: string | null;
    icon?: string | null;
    provider_id?: number | null;
    backend_type?: AgentBackendType;
    model_id?: string | null;
    tools_preset?: string | null;
    home_dir?: string | null;
    is_internal?: boolean;
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
      icon: row.icon ?? null,
      provider_id: row.provider_id ?? null,
      backend_type: row.backend_type ?? "native",
      model_id: row.model_id ?? null,
      tools_preset: row.tools_preset ?? null,
      home_dir: homeDir ?? null,
      is_internal: row.is_internal ? 1 : 0,
      meta: metaJson,
    };
    const result = this.db
      .prepare(
        `INSERT INTO agents (name, description, icon, provider_id, backend_type, model_id, system_prompt, tools_preset, home_dir, is_internal, meta, created_at, updated_at)
				 VALUES (@name, @description, @icon, @provider_id, @backend_type, @model_id, NULL, @tools_preset, @home_dir, @is_internal, @meta, @created_at, @updated_at)`,
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
      system_prompt: null,
    } as AgentRow & { system_prompt: null });
  }

  updateAgent(
    id: number,
    patch: Partial<
      Pick<
        AgentRow,
        | "name"
        | "description"
        | "icon"
        | "provider_id"
        | "backend_type"
        | "model_id"
        | "tools_preset"
        | "home_dir"
        | "is_internal"
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

  upsertMember(row: {
    session_id: number;
    agent_id: number;
    role?: string;
    tags?: string[] | string;
  }): Member {
    const now = Date.now();
    const payload = {
      session_id: row.session_id,
      agent_id: row.agent_id,
      role: row.role ?? "member",
      tags: serializeMemberTags(row.tags),
      created_at: now,
      updated_at: now,
    };
    this.db
      .prepare(
        `INSERT INTO members (session_id, agent_id, role, tags, created_at, updated_at)
         VALUES (@session_id, @agent_id, @role, @tags, @created_at, @updated_at)
         ON CONFLICT(session_id, agent_id) DO UPDATE SET
           role = excluded.role,
           tags = excluded.tags,
           updated_at = excluded.updated_at`,
      )
      .run(payload);
    const member = this.db
      .prepare("SELECT * FROM members WHERE session_id = ? AND agent_id = ?")
      .get(row.session_id, row.agent_id) as MemberRow;
    return rowToMember(member);
  }

  listMembers(sessionId: number): Member[] {
    const rows = this.db
      .prepare("SELECT * FROM members WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as MemberRow[];
    return rows.map(rowToMember);
  }

  replaceSessionAgentMembers(
    sessionId: number,
    shadowAgentId: number | null,
    spawnedAgentIds: number[],
  ): Member[] {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM members WHERE session_id = ? AND role IN ('shadow', 'spawned')")
        .run(sessionId);
      if (shadowAgentId !== null) {
        this.upsertMember({
          session_id: sessionId,
          agent_id: shadowAgentId,
          role: "shadow",
          tags: ["shadow"],
        });
      }
      for (const agentId of [...new Set(spawnedAgentIds)]) {
        this.upsertMember({
          session_id: sessionId,
          agent_id: agentId,
          role: "spawned",
          tags: ["default"],
        });
      }
    });
    transaction();
    return this.listMembers(sessionId);
  }

  listMemberAgentIdsByRole(sessionId: number, role: string): number[] {
    const rows = this.db
      .prepare(
        "SELECT agent_id FROM members WHERE session_id = ? AND role = ? ORDER BY created_at ASC",
      )
      .all(sessionId, role) as Array<{ agent_id: number }>;
    return rows.map((row) => row.agent_id);
  }

  listMemberAgentsByTag(sessionId: number, tag: string): MemberAgent[] {
    const normalized = tag.trim();
    if (!normalized) return [];
    const members = this.listMembers(sessionId).filter((member) =>
      member.tags.includes(normalized),
    );
    const agents: MemberAgent[] = [];
    for (const member of members) {
      const agent = this.getAgent(member.agentId);
      if (agent) agents.push({ ...agent, member });
    }
    return agents;
  }

  getMessageRows(sessionId: number): MessageRow[] {
    return this.db
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as MessageRow[];
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
			SELECT m.entry_id, m.session_id, m.message_role, m.search_text, m.is_old, m.created_at
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
      sql += " AND m.message_role = ?";
      params.push(filter.role);
    }
    sql += " ORDER BY m.created_at DESC LIMIT ?";
    params.push(filter?.limit ?? 50);

    const rows = this.db.prepare(sql).all(...params) as Array<{
      entry_id: string;
      session_id: number;
      message_role: string | null;
      search_text: string | null;
      is_old: number;
      created_at: number;
    }>;

    return rows.map((row) => ({
      messageId: row.entry_id,
      sessionId: row.session_id,
      messageRole: row.message_role,
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
				message_role,
				session_id UNINDEXED,
				message_id UNINDEXED,
				tokenize='unicode61 remove_diacritics 2'
			);
		`);
    this.db.exec(`
			CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages
			WHEN NEW.search_text IS NOT NULL AND NEW.search_text != ''
			BEGIN
				INSERT INTO messages_fts(search_text, message_role, session_id, message_id)
				VALUES (NEW.search_text, NEW.message_role, NEW.session_id, NEW.entry_id);
			END;
		`);
    this.db.exec(`
			CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
				DELETE FROM messages_fts WHERE message_id = OLD.entry_id;
			END;
		`);
    this.db.exec(`
			CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE OF search_text, message_role ON messages BEGIN
				DELETE FROM messages_fts WHERE message_id = OLD.entry_id;
				INSERT INTO messages_fts(search_text, message_role, session_id, message_id)
				SELECT NEW.search_text, NEW.message_role, NEW.session_id, NEW.entry_id
				WHERE NEW.search_text IS NOT NULL AND NEW.search_text != '';
			END;
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
    max_tokens?: number;
    supports_multimodal?: number;
    tags?: string;
  }): Model {
    const now = Date.now();
    const full = {
      provider_id: row.provider_id,
      model_id: row.model_id,
      name: row.name ?? row.model_id,
      context_window: row.context_window ?? 128000,
      max_tokens: row.max_tokens ?? 16384,
      supports_multimodal: row.supports_multimodal ?? 0,
      tags: row.tags ?? "[]",
      created_at: now,
      updated_at: now,
    };
    const result = this.db
      .prepare(
        `INSERT INTO models (provider_id, model_id, name, context_window, max_tokens, supports_multimodal, tags, created_at, updated_at)
			 VALUES (@provider_id, @model_id, @name, @context_window, @max_tokens, @supports_multimodal, @tags, @created_at, @updated_at)`,
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

  updateModel(
    providerId: number,
    modelId: string,
    patch: Partial<{
      name: string | null;
      context_window: number;
      max_tokens: number;
      supports_multimodal: number;
      tags: string;
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
    const agents = this.db
      .prepare("SELECT name FROM agents WHERE provider_id = ? AND model_id = ?")
      .all(providerId, modelId) as Array<{ name: string }>;
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

  listAgentResources(agentId: number, kind?: ResourceKind): AgentResourceBinding[] {
    const sql = kind
      ? `SELECT ar.* FROM agent_resources ar
         INNER JOIN resources r ON r.id = ar.resource_id
         WHERE ar.agent_id = ? AND r.kind = ? AND ar.enabled = 1
         ORDER BY ar.priority DESC, r.slug`
      : `SELECT ar.* FROM agent_resources ar
         INNER JOIN resources r ON r.id = ar.resource_id
         WHERE ar.agent_id = ? AND ar.enabled = 1
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
