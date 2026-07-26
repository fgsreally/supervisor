import type {
  Session,
  SessionAvatar,
  SessionCreationMethod,
  SessionGitMeta,
  SessionRow,
} from "../types.js";
import { normalizeSessionStatus } from "../types.js";
import { normalizeSessionBranchType } from "./session-history.js";
import { sessionBranchName } from "../utils/git.js";

export function parseSessionMeta(meta: string | Record<string, unknown>): Record<string, unknown> {
  if (!meta) return {};
  return typeof meta === "string" ? (JSON.parse(meta) as Record<string, unknown>) : { ...meta };
}

export function parseSessionAvatar(raw: string | null | undefined): SessionAvatar | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionAvatar;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function serializeSessionAvatar(avatar: SessionAvatar | null | undefined): string | null {
  if (!avatar || typeof avatar !== "object") return null;
  return JSON.stringify(avatar);
}

export function parseSessionGitMeta(meta: Record<string, unknown>): SessionGitMeta {
  const raw = meta.git;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const git = raw as Record<string, unknown>;
  const last =
    git.lastCommit && typeof git.lastCommit === "object"
      ? (git.lastCommit as { hash?: unknown; message?: unknown })
      : null;
  return {
    branch: typeof git.branch === "string" ? git.branch : undefined,
    worktreePath:
      typeof git.worktreePath === "string"
        ? git.worktreePath
        : git.worktreePath === null
          ? null
          : undefined,
    lastCommit:
      last && typeof last.hash === "string" && typeof last.message === "string"
        ? { hash: last.hash, message: last.message }
        : last === null
          ? null
          : undefined,
    mergeError: typeof git.mergeError === "string" ? git.mergeError : null,
  };
}

export function resolveCreationMethod(row: SessionRow): SessionCreationMethod {
  const value = row.created_by ?? row.created_via;
  if (
    value === "user" ||
    value === "spawn_agent" ||
    value === "btw" ||
    value === "fork" ||
    value === "clone"
  ) {
    return value;
  }
  if (row.branch_type === "subagent" || row.branch_type === "spawn") return "spawn_agent";
  if (
    row.branch_type === "btw" ||
    row.branch_type === "fork" ||
    row.branch_type === "clone"
  ) {
    return row.branch_type;
  }
  return "user";
}

export interface SessionFieldsPatch {
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
  currentTaskId?: number | null;
}

/**
 * Split a legacy-style meta PATCH body into column updates (title, avatar,
 * pinned, muted, unread, shadowEnabled/shadowDisabled, stage, isBuiltin/builtin)
 * and the remaining keys that should still be merged into `meta`.
 */
export function extractSessionFieldsFromMetaPatch(body: Record<string, unknown>): {
  fields: SessionFieldsPatch;
  rest: Record<string, unknown>;
} {
  const rest: Record<string, unknown> = { ...body };
  const fields: SessionFieldsPatch = {};

  if (typeof rest.title === "string" || rest.title === null) {
    fields.title = rest.title;
    delete rest.title;
  } else if (typeof rest.name === "string" || rest.name === null) {
    fields.title = rest.name;
    delete rest.name;
  }

  if (Object.hasOwn(rest, "avatar")) {
    const avatar = rest.avatar;
    if (avatar === null) {
      fields.avatar = null;
    } else if (avatar && typeof avatar === "object") {
      fields.avatar = serializeSessionAvatar(avatar as SessionAvatar);
    }
    delete rest.avatar;
  }

  if (typeof rest.pinned === "boolean") {
    fields.pinned = rest.pinned;
    delete rest.pinned;
  }
  if (typeof rest.muted === "boolean") {
    fields.muted = rest.muted;
    delete rest.muted;
  }
  if (typeof rest.unread === "number") {
    fields.unread = rest.unread;
    delete rest.unread;
  }
  if (typeof rest.stage === "string" || rest.stage === null) {
    fields.stage = rest.stage;
    delete rest.stage;
  }
  if (typeof rest.shadowEnabled === "boolean") {
    fields.shadowEnabled = rest.shadowEnabled;
    delete rest.shadowEnabled;
  } else if (typeof rest.shadowDisabled === "boolean") {
    fields.shadowEnabled = !rest.shadowDisabled;
    delete rest.shadowDisabled;
  }
  if (typeof rest.isBuiltin === "boolean") {
    fields.isBuiltin = rest.isBuiltin;
    delete rest.isBuiltin;
  } else if (typeof rest.builtin === "boolean") {
    fields.isBuiltin = rest.builtin;
    delete rest.builtin;
  }

  return { fields, rest };
}

/** Map a SessionRow (parsed meta) to the public Session shape. */
export function mapRowToSession(
  row: SessionRow,
  options?: { currentTaskPath?: string | null },
): Session {
  const meta = parseSessionMeta(row.meta);
  const git = parseSessionGitMeta(meta);
  const worktreeEnabled = Boolean(git.worktreePath);
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    sessionId: row.session_id,
    pid: row.pid,
    status: normalizeSessionStatus(row.status),
    thinkingLevel: row.thinking_level,
    cwd: row.cwd,
    leafId: row.leaf_id,
    agentId: row.agent_id,
    branchType: normalizeSessionBranchType(row.branch_type),
    creationMethod: resolveCreationMethod(row),
    showInSessionList: row.show_in_session_list !== 0,
    contextLeafId: row.context_leaf_id ?? null,
    title: row.title ?? (typeof meta.name === "string" ? meta.name : null),
    systemPrompt: row.system_prompt ?? null,
    avatar: parseSessionAvatar(row.avatar) ??
      (meta.avatar && typeof meta.avatar === "object" ? (meta.avatar as SessionAvatar) : null),
    isBuiltin: row.is_builtin === 1 || meta.builtin === true,
    pinned: row.pinned === 1 || meta.pinned === true,
    muted: row.muted === 1 || meta.muted === true,
    unread: typeof row.unread === "number" ? row.unread : typeof meta.unread === "number" ? meta.unread : 0,
    externalSessionId:
      row.external_session_id ??
      (typeof meta.externalSessionId === "string" ? meta.externalSessionId : null),
    errorMsg: row.error_msg ?? null,
    stage: row.stage ?? null,
    shadowEnabled: row.shadow_enabled === 1,
    currentTaskId: row.current_task_id ?? null,
    createdAt: new Date(row.created_at),
    lastActiveAt: new Date(row.last_active_at),
    meta,
    currentTask: options?.currentTaskPath ?? null,
    gitSessionBranch: worktreeEnabled
      ? (git.branch ?? sessionBranchName(String(row.id)))
      : null,
    gitWorktreeEnabled: worktreeEnabled,
    gitMergeError: git.mergeError ?? null,
    gitLastCommit: git.lastCommit ?? null,
  };
}
