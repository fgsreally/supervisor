import { mkdirSync } from "node:fs";
import { join } from "node:path";
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
  HomeTaskPhase,
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
import {
  HOME_TASK_PHASES,
  HOME_TASK_PRIORITIES,
  HOME_TASK_STATUSES,
  normalizeSessionStatus,
} from "../types.js";
import { normalizeAgentPermissionRules } from "../core/agent-permissions.js";
import { parseSessionMeta } from "../core/session-fields.js";
import { getProjectDir } from "../core/session-files.js";
import type { SessionBranchType } from "../core/session-history.js";
import {
  listProjectScripts,
  replaceProjectScripts,
  type ProjectScriptInput,
  type ProjectScriptKind,
} from "../core/project-scripts.js";
import { normalizeApiProtocol, requireApiProtocol } from "../config/api-protocol.js";
import { openSqliteDatabase, type SqliteDatabase } from "./sqlite.js";
import { execSqlFile } from "./sql-loader.js";

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

function parseHomeTaskPhase(value: string | null | undefined): HomeTaskPhase {
  return (HOME_TASK_PHASES as readonly string[]).includes(value ?? "")
    ? (value as HomeTaskPhase)
    : "draft";
}

function parseIdListJson(value: string | null | undefined): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is number => typeof item === "number" && Number.isSafeInteger(item) && item > 0,
    );
  } catch {
    return [];
  }
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
    agentId: row.agent_id ?? null,
    dependsOn: parseIdListJson(row.depends_on),
    subagentIds: parseIdListJson(row.subagent_ids),
    phase: parseHomeTaskPhase(row.phase),
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
      : ((row.spawn_type as SessionRow["created_by"]) ?? "user"));
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
    meta: JSON.parse(
      typeof row.meta === "string" ? row.meta : JSON.stringify(row.meta ?? {}),
    ) as any,
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
    permissionRules: (() => {
      try {
        return normalizeAgentPermissionRules(JSON.parse(row.permission_rules ?? "null"));
      } catch {
        return normalizeAgentPermissionRules(null);
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
  const protocol = normalizeApiProtocol(row.protocol);
  if (!protocol) {
    throw new Error(`Provider ${row.id} has unknown wire protocol: ${row.protocol}`);
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    icon: row.icon,
    protocol,
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
  public readonly db: SqliteDatabase;
  private readonly statusListeners = new Set<(id: number, status: SessionStatus) => void>();

  constructor(dbPath?: string) {
    const resolved = resolveDbPath(dbPath);
    mkdirSync(join(resolved, ".."), { recursive: true });
    this.db = openSqliteDatabase(resolved);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
    activeDb = this;
  }

  private migrate() {
    execSqlFile(this.db, "schema.sql");
    this.db.exec(`
      INSERT INTO timeline_events (type, entity_id, project_id, kind, status, data, created_at)
      SELECT 'session', id, project_id, 'created', status, '{}', created_at
      FROM sessions source
      WHERE NOT EXISTS (
        SELECT 1 FROM timeline_events target
        WHERE target.type = 'session' AND target.entity_id = source.id
      );
    `);
    this.ensureMessageFts();
    this.db.exec(`
      INSERT INTO timeline_events (type, entity_id, project_id, kind, status, data, created_at)
      SELECT 'todo_task', id, project_id, 'created', status, '{}', created_at
      FROM todo_task source
      WHERE NOT EXISTS (
        SELECT 1 FROM timeline_events target
        WHERE target.type = 'todo_task' AND target.entity_id = source.id
      );
    `);
  }

  listProjectScripts(projectId: number, kind?: ProjectScriptKind) {
    return listProjectScripts(this.db, projectId, kind);
  }

  replaceProjectScripts(projectId: number, scripts: ProjectScriptInput[]) {
    return replaceProjectScripts(this.db, projectId, scripts);
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

  updateProject(id: number, patch: { name?: string; description?: string | null }): Project {
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
    const full: Omit<SessionRow, "id"> = {
      ...row,
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
          title, system_prompt, avatar, is_builtin,
          external_session_id, error_msg, stage, shadow_enabled,
          created_at, last_active_at, meta
        ) VALUES (
          @project_id, @parent_id, @status, @thinking_level, @cwd, @leaf_id, @agent_id,
          @spawn_type, @created_by,
          @title, @system_prompt, @avatar, @is_builtin,
          @external_session_id, @error_msg, @stage, @shadow_enabled,
          @created_at, @last_active_at, @meta
        )`,
      )
      .run(full);
    const created = rowToSession({ ...full, id: Number(result.lastInsertRowid) });
    this.appendTimelineEvent(
      "session",
      created.id,
      created.project_id,
      "created",
      created.status,
      {},
      created.created_at,
    );
    return created;
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
    const before = this.get(id);
    this.db
      .prepare("UPDATE sessions SET status = ?, last_active_at = ? WHERE id = ?")
      .run(status, now, id);
    if (before && before.status !== status) {
      this.appendTimelineEvent(
        "session",
        id,
        before.project_id,
        "status_changed",
        status,
        { from: before.status, to: status },
        now,
      );
    }
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

  appendTimelineEvent(
    type: "session" | "todo_task" | "goal",
    entityId: number,
    projectId: number | null,
    kind: string,
    status: string | null,
    data: Record<string, unknown> = {},
    createdAt = Date.now(),
  ): void {
    this.db
      .prepare(
        `INSERT INTO timeline_events (type, entity_id, project_id, kind, status, data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(type, entityId, projectId, kind, status, JSON.stringify(data), createdAt);
  }

  listTimelineEvents(
    options: {
      from?: number;
      to?: number;
      projectId?: number;
      type?: "session" | "todo_task" | "goal";
    } = {},
  ) {
    let sql = `SELECT id, type, entity_id, project_id, kind, status, data, created_at
               FROM timeline_events WHERE 1=1`;
    const params: Array<number | string> = [];
    if (options.type) {
      sql += " AND type = ?";
      params.push(options.type);
    }
    if (options.from != null) {
      sql += " AND created_at >= ?";
      params.push(options.from);
    }
    if (options.to != null) {
      sql += " AND created_at <= ?";
      params.push(options.to);
    }
    if (options.projectId != null) {
      sql += " AND project_id = ?";
      params.push(options.projectId);
    }
    sql += " ORDER BY created_at ASC, id ASC";
    return (
      this.db.prepare(sql).all(...params) as Array<{
        id: number;
        type: "session" | "todo_task" | "goal";
        entity_id: number;
        project_id: number | null;
        kind: string;
        status: SessionStatus | null;
        data: string;
        created_at: number;
      }>
    ).map((row) => ({
      id: String(row.id),
      type: row.type,
      entityId: String(row.entity_id),
      projectId: row.project_id == null ? null : String(row.project_id),
      kind: row.kind,
      status: row.status,
      data: JSON.parse(row.data || "{}") as Record<string, unknown>,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  getSessionUsage(sessionId: number) {
    const totals = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      messages: 0,
    };
    const rows = this.db
      .prepare("SELECT payload FROM messages WHERE session_id = ? AND role = 'assistant'")
      .all(sessionId) as Array<{ payload: string }>;
    for (const row of rows) {
      try {
        const entry = JSON.parse(row.payload) as {
          message?: { usage?: Record<string, unknown> };
          usage?: Record<string, unknown>;
        };
        const usage = entry.message?.usage ?? entry.usage;
        if (!usage) continue;
        totals.messages += 1;
        for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) {
          totals[key] += Number(usage[key]) || 0;
        }
        const cost = usage.cost as Record<string, unknown> | undefined;
        if (cost)
          for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) {
            totals.cost[key] += Number(cost[key]) || 0;
          }
      } catch {
        /* Ignore malformed historic rows. */
      }
    }
    return totals;
  }

  onSessionStatusChange(listener: (id: number, status: SessionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Bubble activity timestamp to parent sessions so project lists stay fresh. */
  touchSessionActivityTree(id: number, at = Date.now()): void {
    let current = this.get(id);
    while (current) {
      this.db.prepare("UPDATE sessions SET last_active_at = ? WHERE id = ?").run(at, current.id);
      current = current.parent_id != null ? this.get(current.parent_id) : undefined;
    }
  }

  /** Normalize process-bound Session state after Supervisor starts. */
  reconcileInterruptedSessionStatuses(): number {
    // Transient busy / in-flight states 鈫?idle.
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
      projectId?: number | null;
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
    if (patch.externalSessionId !== undefined) put("external_session_id", patch.externalSessionId);
    if (patch.errorMsg !== undefined) put("error_msg", patch.errorMsg);
    if (patch.stage !== undefined) put("stage", patch.stage);
    if (patch.shadowEnabled !== undefined) put("shadow_enabled", patch.shadowEnabled ? 1 : 0);
    if (patch.projectId !== undefined) put("project_id", patch.projectId);
    if (sets.length === 0) return;
    sets.push("last_active_at = ?");
    params.push(Date.now(), id);
    this.db.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  }

  listSessionTasks(sessionId: number): SessionTaskRow[] {
    const row = this.get(sessionId);
    const meta = row ? parseSessionMeta(row.meta) : {};
    const tasks = Array.isArray(meta.tasks) ? meta.tasks : [];
    return tasks.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const task = item as { path?: unknown; kind?: unknown; title?: unknown; status?: unknown };
      if (typeof task.path !== "string") return [];
      return [
        {
          id: syntheticMetaId(task.path),
          session_id: sessionId,
          path: task.path,
          kind: task.kind === "plan" ? "plan" : "goal",
          title: typeof task.title === "string" ? task.title : null,
          status: typeof task.status === "string" ? task.status : null,
          created_at: index,
          updated_at: index,
        },
      ];
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
      ...tasks
        .filter((task) => task.path !== row.path)
        .map(({ id, session_id, created_at, updated_at, ...task }) => task),
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
    const meta = session ? parseSessionMeta(session.meta) : {};
    this.updateMeta(sessionId, {
      tasks: tasks
        .filter((task) => task.path !== path)
        .map(({ id, session_id, created_at, updated_at, ...task }) => task),
      ...(meta.currentTask === path ? { currentTask: null } : {}),
    });
    return true;
  }

  listSessionTodos(sessionId: number): SessionTodoRow[] {
    const row = this.get(sessionId);
    const meta = row ? parseSessionMeta(row.meta) : undefined;
    const todos = Array.isArray(meta?.todos) ? meta.todos : [];
    return todos.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const todo = item as { title?: unknown; status?: unknown };
      if (typeof todo.title !== "string") return [];
      return [
        {
          id: index + 1,
          session_id: sessionId,
          title: todo.title,
          status: normalizeTodoStatus(todo.status),
          sort_order: index,
          created_at: index,
          updated_at: index,
        },
      ];
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
      .get(id) as AgentRow | undefined;
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
    permission_rules?: string | import("../core/agent-permissions.js").AgentPermissionRules;
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
      permission_rules:
        typeof row.permission_rules === "string"
          ? row.permission_rules
          : JSON.stringify(
              row.permission_rules ??
                (row.backend_type === undefined || row.backend_type === "native"
                  ? normalizeAgentPermissionRules(undefined)
                  : {}),
            ),
      meta: metaJson,
    };
    const result = this.db
      .prepare(
        `INSERT INTO agents (name, description, avatar, backend_type, model_id, system_prompt, tools_preset, home_dir, is_builtin, external_config, permission_rules, meta, created_at, updated_at)
				 VALUES (@name, @description, @avatar, @backend_type, @model_id, @system_prompt, @tools_preset, @home_dir, @is_builtin, @external_config, @permission_rules, @meta, @created_at, @updated_at)`,
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
        | "permission_rules"
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
      } else if (k === "permission_rules") {
        sets.push("permission_rules = ?");
        params.push(typeof v === "string" ? v : JSON.stringify(v));
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
      .prepare(`SELECT 1 AS ok FROM messages WHERE session_id = ? AND id < ? LIMIT 1`)
      .get(sessionId, beforeId) as { ok: number } | undefined;
    return !!row;
  }

  searchMessages(
    query: string,
    filter?: { sessionId?: number; role?: string; limit?: number },
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
    execSqlFile(this.db, "messages-fts.sql");
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
    protocol: string;
    base_url?: string | null;
    api_key?: string | null;
    is_enabled?: number;
  }): number {
    const now = Date.now();
    const result = this.db
      .prepare(
        `INSERT INTO providers (slug, name, icon, protocol, base_url, api_key, is_enabled, created_at, updated_at)
				 VALUES (@slug, @name, @icon, @protocol, @base_url, @api_key, @is_enabled, @created_at, @updated_at)`,
      )
      .run({
        ...row,
        protocol: requireApiProtocol(row.protocol),
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
      protocol: string;
      base_url: string | null;
      api_key: string | null;
      is_enabled: number;
    }>,
  ): void {
    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [Date.now()];
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = ?`);
      if (k === "api_key" && typeof v === "string" && v) {
        params.push(encryptApiKey(v));
      } else if (k === "protocol" && typeof v === "string") {
        params.push(requireApiProtocol(v));
      } else {
        params.push(v);
      }
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
      .run(agentId, resourceId, options?.enabled === false ? 0 : 1, options?.priority ?? 0, now);
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
          "SELECT * FROM todo_task WHERE parent_id IS NULL ORDER BY updated_at DESC, id DESC",
        )
        .all() as HomeTaskRow[];
    } else if (typeof options?.parentId === "number") {
      rows = this.db
        .prepare("SELECT * FROM todo_task WHERE parent_id = ? ORDER BY created_at ASC, id ASC")
        .all(options.parentId) as HomeTaskRow[];
    } else if (typeof options?.projectId === "number") {
      rows = this.db
        .prepare("SELECT * FROM todo_task WHERE project_id = ? ORDER BY updated_at DESC, id DESC")
        .all(options.projectId) as HomeTaskRow[];
    } else {
      rows = this.db
        .prepare("SELECT * FROM todo_task ORDER BY updated_at DESC, id DESC")
        .all() as HomeTaskRow[];
    }
    return rows.map(rowToHomeTask);
  }

  getHomeTask(id: number): HomeTask | undefined {
    const row = this.db.prepare("SELECT * FROM todo_task WHERE id = ?").get(id) as
      | HomeTaskRow
      | undefined;
    return row ? rowToHomeTask(row) : undefined;
  }

  getHomeTaskBySessionId(sessionId: number): HomeTask | undefined {
    const row = this.db
      .prepare("SELECT * FROM todo_task WHERE session_id = ? ORDER BY id DESC LIMIT 1")
      .get(sessionId) as HomeTaskRow | undefined;
    return row ? rowToHomeTask(row) : undefined;
  }

  insertHomeTask(options: CreateHomeTaskOptions): HomeTask {
    const title = options.title.trim();
    if (!title) throw new Error("title is required");
    const now = Date.now();
    const result = this.db
      .prepare(
        `INSERT INTO todo_task (
          title, description, project_id, status, priority, parent_id, session_id,
          agent_id, depends_on, subagent_ids, phase, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        title,
        options.description?.trim() ?? "",
        options.projectId ?? null,
        options.status ?? "todo",
        options.priority ?? "normal",
        options.parentId ?? null,
        options.sessionId ?? null,
        options.agentId ?? null,
        JSON.stringify(options.dependsOn ?? []),
        JSON.stringify(options.subagentIds ?? []),
        options.phase ?? "draft",
        now,
        now,
      );
    const created = this.getHomeTask(Number(result.lastInsertRowid))!;
    this.appendTimelineEvent(
      "todo_task",
      created.id,
      created.projectId,
      "created",
      created.status,
      {},
      created.createdAt.getTime(),
    );
    return created;
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
      agent_id: patch.agentId !== undefined ? patch.agentId : current.agentId,
      depends_on: JSON.stringify(
        patch.dependsOn !== undefined ? patch.dependsOn : current.dependsOn,
      ),
      subagent_ids: JSON.stringify(
        patch.subagentIds !== undefined ? patch.subagentIds : current.subagentIds,
      ),
      phase: patch.phase ?? current.phase,
      error: patch.error !== undefined ? patch.error : current.error,
      updated_at: Date.now(),
    };
    if (!next.title) throw new Error("title is required");
    this.db
      .prepare(
        `UPDATE todo_task SET
          title = ?, description = ?, project_id = ?, status = ?, priority = ?,
          parent_id = ?, session_id = ?, agent_id = ?, depends_on = ?, subagent_ids = ?,
          phase = ?, error = ?, updated_at = ?
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
        next.agent_id,
        next.depends_on,
        next.subagent_ids,
        next.phase,
        next.error,
        next.updated_at,
        id,
      );
    const updated = this.getHomeTask(id)!;
    if (current.status !== updated.status || current.phase !== updated.phase) {
      this.appendTimelineEvent(
        "todo_task",
        id,
        updated.projectId,
        current.status !== updated.status ? "status_changed" : "phase_changed",
        updated.status,
        {
          fromStatus: current.status,
          toStatus: updated.status,
          fromPhase: current.phase,
          toPhase: updated.phase,
        },
        next.updated_at,
      );
    }
    return updated;
  }

  deleteHomeTask(id: number): boolean {
    return this.db.prepare("DELETE FROM todo_task WHERE id = ?").run(id).changes > 0;
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

let activeDb: SupervisorDb | undefined;

/** Return the process-wide database opened by the application entrypoint. */
export function getDb(): SupervisorDb {
  if (!activeDb) throw new Error("Database has not been opened");
  return activeDb;
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
