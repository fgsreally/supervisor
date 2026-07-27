import type { SupervisorDb } from "../db/db.js";

export type ProjectScriptKind = "install" | "start" | "destroy";

export interface ProjectScript {
  id: number;
  projectId: number;
  kind: ProjectScriptKind;
  name: string;
  command: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectScriptInput {
  kind: ProjectScriptKind;
  name: string;
  command: string;
}

interface ProjectScriptRow {
  id: number;
  project_id: number;
  kind: string;
  name: string;
  command: string;
  created_at: number;
  updated_at: number;
}

function rowToScript(row: ProjectScriptRow): ProjectScript {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as ProjectScriptKind,
    name: row.name,
    command: row.command,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function ensureProjectScriptsTable(db: SupervisorDb["db"]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_project_scripts_project
      ON project_scripts(project_id, kind, id);
  `);
}

export function listProjectScripts(
  db: SupervisorDb["db"],
  projectId: number,
  kind?: ProjectScriptKind,
): ProjectScript[] {
  if (kind) {
    const rows = db
      .prepare(
        `SELECT * FROM project_scripts
         WHERE project_id = ? AND kind = ?
         ORDER BY id ASC`,
      )
      .all(projectId, kind) as ProjectScriptRow[];
    return rows.map(rowToScript);
  }
  const rows = db
    .prepare(
      `SELECT * FROM project_scripts
       WHERE project_id = ?
       ORDER BY kind ASC, id ASC`,
    )
    .all(projectId) as ProjectScriptRow[];
  return rows.map(rowToScript);
}

export function replaceProjectScripts(
  db: SupervisorDb["db"],
  projectId: number,
  scripts: ProjectScriptInput[],
): ProjectScript[] {
  const now = Date.now();
  db.prepare("DELETE FROM project_scripts WHERE project_id = ?").run(projectId);
  const insert = db.prepare(
    `INSERT INTO project_scripts
      (project_id, kind, name, command, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const script of scripts) {
    const command = script.command.trim();
    if (!command) continue;
    const kind = script.kind;
    if (kind !== "install" && kind !== "start" && kind !== "destroy") continue;
    const name = script.name.trim() || kind;
    insert.run(
      projectId,
      kind,
      name,
      command,
      now,
      now,
    );
  }
  return listProjectScripts(db, projectId);
}

/** Migrate legacy projects.(install|start|destroy)_command columns into project_scripts once. */
export function migrateLegacyProjectCommands(db: SupervisorDb["db"]): void {
  ensureProjectScriptsTable(db);
  const projectColumns = new Set(
    (db.pragma("table_info(projects)") as Array<{ name: string }>).map((column) => column.name),
  );
  if (
    !projectColumns.has("install_command") &&
    !projectColumns.has("start_command") &&
    !projectColumns.has("destroy_command")
  ) {
    return;
  }
  const projects = db
    .prepare(
      `SELECT id,
        ${projectColumns.has("install_command") ? "install_command" : "NULL AS install_command"},
        ${projectColumns.has("start_command") ? "start_command" : "NULL AS start_command"},
        ${projectColumns.has("destroy_command") ? "destroy_command" : "NULL AS destroy_command"}
       FROM projects`,
    )
    .all() as Array<{
    id: number;
    install_command: string | null;
    start_command: string | null;
    destroy_command: string | null;
  }>;
  for (const project of projects) {
    const existing = listProjectScripts(db, project.id);
    if (existing.length > 0) continue;
    const inputs: ProjectScriptInput[] = [];
    if (project.install_command?.trim()) {
      inputs.push({
        kind: "install",
        name: "install",
        command: project.install_command.trim(),
      });
    }
    if (project.start_command?.trim()) {
      inputs.push({
        kind: "start",
        name: "start",
        command: project.start_command.trim(),
      });
    }
    if (project.destroy_command?.trim()) {
      inputs.push({
        kind: "destroy",
        name: "destroy",
        command: project.destroy_command.trim(),
      });
    }
    if (inputs.length > 0) replaceProjectScripts(db, project.id, inputs);
  }
}
