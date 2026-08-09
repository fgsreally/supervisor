import type { SqliteDatabase } from "./sqlite.js";

function tableExists(db: SqliteDatabase, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

/** Rename `home_tasks` or merge into `todo_task` when both exist after baseline schema. */
export function migrateHomeTasksTable(db: SqliteDatabase): void {
  if (!tableExists(db, "home_tasks")) return;

  if (!tableExists(db, "todo_task")) {
    db.exec("ALTER TABLE home_tasks RENAME TO todo_task");
    return;
  }

  const homeColumns = (db.pragma("table_info(home_tasks)") as Array<{ name: string }>).map(
    (column) => column.name,
  );
  const todoColumns = new Set(
    (db.pragma("table_info(todo_task)") as Array<{ name: string }>).map((column) => column.name),
  );
  const sharedColumns = homeColumns.filter((column) => todoColumns.has(column));
  if (sharedColumns.length === 0) {
    db.exec("DROP TABLE home_tasks");
    return;
  }

  const columnList = sharedColumns.join(", ");
  db.exec(`INSERT INTO todo_task (${columnList}) SELECT ${columnList} FROM home_tasks`);
  db.exec("DROP TABLE home_tasks");
}

function columnNames(db: SqliteDatabase, table: string): Set<string> {
  return new Set(
    (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((column) => column.name),
  );
}

/** Ensure plan-related columns exist on legacy `todo_task` tables. */
export function ensureTodoTaskPlanColumns(db: SqliteDatabase): void {
  if (!tableExists(db, "todo_task")) return;

  const columns = columnNames(db, "todo_task");
  if (!columns.has("agent_id")) {
    db.exec(
      "ALTER TABLE todo_task ADD COLUMN agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL",
    );
  }
  if (!columns.has("depends_on")) {
    db.exec("ALTER TABLE todo_task ADD COLUMN depends_on TEXT NOT NULL DEFAULT '[]'");
  }
  if (!columns.has("subagent_ids")) {
    db.exec("ALTER TABLE todo_task ADD COLUMN subagent_ids TEXT NOT NULL DEFAULT '[]'");
  }
  if (!columns.has("phase")) {
    db.exec("ALTER TABLE todo_task ADD COLUMN phase TEXT NOT NULL DEFAULT 'draft'");
  }
}

function normalizeLegacyTodoStatus(value: unknown): string {
  if (value === "done") return "completed";
  if (value === "in_progress" || value === "completed" || value === "cancelled") return value;
  return "pending";
}

/** Move legacy `session_tasks` / `session_todos` rows into `sessions.meta`. */
export function migrateSessionTasksToMeta(db: SqliteDatabase): void {
  if (!tableExists(db, "session_tasks") && !tableExists(db, "session_todos")) return;

  const sessionColumns = columnNames(db, "sessions");
  const hasCurrentTaskId = sessionColumns.has("current_task_id");

  const sessions = db.prepare("SELECT id, meta FROM sessions").all() as Array<{
    id: number;
    meta: string;
  }>;

  for (const session of sessions) {
    let meta: Record<string, unknown>;
    try {
      meta = JSON.parse(session.meta || "{}") as Record<string, unknown>;
    } catch {
      meta = {};
    }

    const normalizedTasks: Array<{
      path: string;
      kind: string;
      title?: string | null;
      status?: string | null;
    }> = [];

    for (const item of Array.isArray(meta.tasks) ? meta.tasks : []) {
      if (typeof item === "string") {
        normalizedTasks.push({
          path: item,
          kind: item.startsWith("plan/") ? "plan" : "goal",
        });
      } else if (
        item &&
        typeof item === "object" &&
        typeof (item as { path?: unknown }).path === "string"
      ) {
        const task = item as { path: string; kind?: unknown; title?: unknown; status?: unknown };
        normalizedTasks.push({
          path: task.path,
          kind: task.kind === "plan" ? "plan" : "goal",
          title: typeof task.title === "string" ? task.title : null,
          status: typeof task.status === "string" ? task.status : null,
        });
      }
    }

    if (tableExists(db, "session_tasks")) {
      const rows = db
        .prepare(
          "SELECT path, kind, title, status FROM session_tasks WHERE session_id = ? ORDER BY id",
        )
        .all(session.id) as Array<{
        path: string;
        kind: string;
        title: string | null;
        status: string | null;
      }>;
      for (const row of rows) {
        if (normalizedTasks.some((task) => task.path === row.path)) continue;
        normalizedTasks.push({
          path: row.path,
          kind: row.kind === "plan" ? "plan" : "goal",
          title: row.title,
          status: row.status,
        });
      }
    }

    if (hasCurrentTaskId && tableExists(db, "session_tasks")) {
      const current = db
        .prepare("SELECT current_task_id FROM sessions WHERE id = ?")
        .get(session.id) as { current_task_id: number | null } | undefined;
      if (current?.current_task_id != null) {
        const taskRow = db
          .prepare("SELECT path FROM session_tasks WHERE id = ?")
          .get(current.current_task_id) as { path: string } | undefined;
        if (taskRow?.path) meta.currentTask = taskRow.path;
      }
    }

    meta.tasks = normalizedTasks;

    const normalizedTodos: Array<{ title: string; status: string }> = [];
    for (const item of Array.isArray(meta.todos) ? meta.todos : []) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { title?: unknown }).title === "string"
      ) {
        const todo = item as { title: string; status?: unknown };
        normalizedTodos.push({
          title: todo.title,
          status: normalizeLegacyTodoStatus(todo.status),
        });
      }
    }

    if (tableExists(db, "session_todos")) {
      const rows = db
        .prepare(
          "SELECT title, status FROM session_todos WHERE session_id = ? ORDER BY sort_order, id",
        )
        .all(session.id) as Array<{ title: string; status: string }>;
      for (const row of rows) {
        normalizedTodos.push({
          title: row.title,
          status: normalizeLegacyTodoStatus(row.status),
        });
      }
    }

    meta.todos = normalizedTodos;
    db.prepare("UPDATE sessions SET meta = ? WHERE id = ?").run(JSON.stringify(meta), session.id);
  }
}

/** Idempotent schema convergence for columns also covered by versioned SQL migrations. */
export function convergeLegacySchema(db: SqliteDatabase): void {
  migrateHomeTasksTable(db);
  ensureTodoTaskPlanColumns(db);
  migrateSessionTasksToMeta(db);

  if (
    tableExists(db, "push_devices") &&
    !columnNames(db, "push_devices").has("manufacturer_push_token")
  ) {
    db.exec("ALTER TABLE push_devices ADD COLUMN manufacturer_push_token TEXT");
  }

  for (const table of [
    "session_tasks",
    "session_todos",
    "extensions",
    "members",
    "job_schedules",
  ]) {
    if (tableExists(db, table)) db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
}
