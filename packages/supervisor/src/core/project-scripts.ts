import type { SupervisorDb } from "../db/db.js";
import { execSqlFile } from "../db/sql-loader.js";

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
  execSqlFile(db, "project-scripts.sql");
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
    insert.run(projectId, kind, name, command, now, now);
  }
  return listProjectScripts(db, projectId);
}
