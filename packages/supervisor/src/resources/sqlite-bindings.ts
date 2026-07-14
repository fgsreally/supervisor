import type { ExtensionSqliteDatabase } from "../extension-system/types.js";
import type { ResourceKind } from "./types.js";

export function listAgentResourcePathsFromSqlite(
  sqlite: ExtensionSqliteDatabase,
  agentId: number,
  kind: ResourceKind,
): string[] {
  const rows = sqlite
    .prepare(
      `SELECT r.source_path AS source_path
       FROM resources r
       INNER JOIN agent_resources ar ON ar.resource_id = r.id
       WHERE ar.agent_id = ? AND ar.enabled = 1 AND r.kind = ?
       ORDER BY ar.priority DESC, r.slug`,
    )
    .all(agentId, kind) as Array<{ source_path: string | null }>;
  return rows.map((row) => row.source_path).filter((p): p is string => Boolean(p));
}

export function listAgentToolSlugsFromSqlite(
  sqlite: ExtensionSqliteDatabase,
  agentId: number,
): string[] {
  const rows = sqlite
    .prepare(
      `SELECT r.slug AS slug
       FROM resources r
       INNER JOIN agent_resources ar ON ar.resource_id = r.id
       WHERE ar.agent_id = ? AND ar.enabled = 1 AND r.kind = 'tool'
       ORDER BY ar.priority DESC, r.slug`,
    )
    .all(agentId) as Array<{ slug: string }>;
  return rows.map((row) => row.slug);
}
