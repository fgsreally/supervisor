import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type AgentPermissionEffect = "ask" | "deny";
export type AgentPermissionRules = Record<string, Record<string, AgentPermissionEffect>>;

export const DEFAULT_AGENT_PERMISSION_RULES: AgentPermissionRules = {
  read: {
    "external/**": "ask",
    "**/.env": "deny",
    "**/.env.*": "deny",
    "**/.ssh/**": "deny",
  },
  write: { "external/**": "ask" },
  edit: { "external/**": "ask" },
  bash: {
    "rm -rf *": "ask",
    "rm -r *": "ask",
    "sudo *": "ask",
    "git push --force*": "ask",
    "git reset --hard*": "ask",
    "chmod -R *": "ask",
    "chown -R *": "ask",
    "Remove-Item * -Recurse*": "ask",
    "Remove-Item -Recurse *": "ask",
    "shutdown*": "ask",
    "reboot*": "ask",
  },
};

const PATH_TOOLS = new Set(["read", "write", "edit", "patch", "apply_patch", "grep", "find", "ls"]);

function cloneRules(rules: AgentPermissionRules): AgentPermissionRules {
  return Object.fromEntries(Object.entries(rules).map(([tool, entries]) => [tool, { ...entries }]));
}

export function normalizeAgentPermissionRules(value: unknown): AgentPermissionRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return cloneRules(DEFAULT_AGENT_PERMISSION_RULES);
  }
  const result: AgentPermissionRules = {};
  for (const [tool, rawEntries] of Object.entries(value as Record<string, unknown>)) {
    if (!tool.trim() || !rawEntries || typeof rawEntries !== "object" || Array.isArray(rawEntries))
      continue;
    const entries: Record<string, AgentPermissionEffect> = {};
    for (const [pattern, effect] of Object.entries(rawEntries as Record<string, unknown>)) {
      if (pattern.trim() && (effect === "ask" || effect === "deny")) entries[pattern] = effect;
    }
    if (Object.keys(entries).length > 0) result[tool.toLowerCase()] = entries;
  }
  return result;
}

function slashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function canonicalPath(path: string): string {
  const absolute = resolve(path);
  let existing = absolute;
  const missing: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return absolute;
    missing.unshift(basename(existing));
    existing = parent;
  }
  try {
    return join(realpathSync.native(existing), ...missing);
  } catch {
    return absolute;
  }
}

function isWorktreePath(path: string): boolean {
  return /(?:^|[/\\])\.supervisor[/\\]worktrees(?:[/\\]|$)/i.test(path);
}

/** Infer repo/project root when cwd is a session worktree under `.supervisor/worktrees`. */
export function inferProjectRootFromCwd(cwd: string): string | null {
  const canon = canonicalPath(cwd);
  const normalized = slashes(canon);
  const marker = "/.supervisor/worktrees/";
  const index = normalized.toLowerCase().indexOf(marker);
  if (index < 0) return null;
  return canonicalPath(normalized.slice(0, index));
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const key = process.platform === "win32" ? path.toLowerCase() : path;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(path);
  }
  return result;
}

export function resolvePermissionRoots(cwd: string, projectRoots: string[] = []): string[] {
  const cwdCanon = canonicalPath(cwd);
  const inferred = inferProjectRootFromCwd(cwdCanon);
  return uniquePaths([
    ...projectRoots.map((root) => canonicalPath(root)),
    ...(inferred ? [inferred] : []),
    cwdCanon,
  ]);
}

/**
 * Map a filesystem path into permission targets:
 * - inside session cwd / project root / worktree parent → `project/<rel>`
 * - otherwise → `external/<abs>`
 *
 * Relatives prefer the non-worktree project root so reading
 * `D:/repo/package.json` from a worktree cwd is still `project/package.json`.
 */
export function permissionPathTarget(
  input: string,
  cwd: string,
  projectRoots: string[] = [],
): string {
  const roots = resolvePermissionRoots(cwd, projectRoots);
  const target = canonicalPath(isAbsolute(input) ? input : resolve(cwd, input));
  const hits: Array<{ root: string; rel: string; worktree: boolean }> = [];
  for (const root of roots) {
    const rel = relative(root, target);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) continue;
    hits.push({ root, rel: slashes(rel || "."), worktree: isWorktreePath(root) });
  }
  if (hits.length === 0) return `external/${slashes(target)}`;
  hits.sort((a, b) => Number(a.worktree) - Number(b.worktree) || a.rel.length - b.rel.length);
  return `project/${hits[0]!.rel}`;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = slashes(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/__DOUBLE_STAR__/g, ".*");
  return new RegExp(`^${escaped}$`, process.platform === "win32" ? "i" : "");
}

export function matchPermissionGlob(pattern: string, value: string): boolean {
  return globToRegExp(pattern).test(slashes(value));
}

/** Split a shell command chain without treating operators inside quotes as separators. */
export function splitShellCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  const flush = () => {
    const value = current.trim();
    if (value) parts.push(value);
    current = "";
  };

  for (let index = 0; index < command.length; index++) {
    const char = command[index]!;
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" || char === "`") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\n" || char === ";" || char === "|" || char === "&") {
      flush();
      if ((char === "|" || char === "&") && command[index + 1] === char) index++;
      continue;
    }
    current += char;
  }
  flush();
  return parts;
}

export function permissionTargets(
  toolName: string,
  args: unknown,
  cwd: string,
  projectRoots: string[] = [],
): string[] {
  if (!args || typeof args !== "object") return [];
  const record = args as Record<string, unknown>;
  const name = toolName.toLowerCase();
  if (name === "bash" && typeof record.command === "string") {
    return splitShellCommand(record.command);
  }
  if (PATH_TOOLS.has(name)) {
    const pathKeys = new Set(["file_path", "filePath", "path", "file"]);
    return Object.entries(record).flatMap(([key, value]) => {
      if (typeof value !== "string" || value.length === 0) return [];
      return [pathKeys.has(key) ? permissionPathTarget(value, cwd, projectRoots) : value];
    });
  }
  return Object.values(record).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

export interface AgentPermissionDecision {
  effect: "allow" | AgentPermissionEffect;
  tool: string;
  target: string;
  pattern?: string;
  matchedTarget?: string;
}

export function evaluateAgentPermission(
  rules: AgentPermissionRules,
  toolName: string,
  args: unknown,
  cwd: string,
  projectRoots: string[] = [],
): AgentPermissionDecision {
  const tool = toolName.toLowerCase();
  const entries = rules[tool];
  const targets = permissionTargets(tool, args, cwd, projectRoots);
  if (!entries || targets.length === 0) return { effect: "allow", tool, target: targets[0] ?? "" };
  const matches: AgentPermissionDecision[] = [];
  for (const target of targets) {
    for (const [pattern, effect] of Object.entries(entries)) {
      if (matchPermissionGlob(pattern, target)) matches.push({ effect, tool, target, pattern });
    }
  }
  const decision = matches.find((item) => item.effect === "deny") ??
    matches.find((item) => item.effect === "ask") ?? {
      effect: "allow",
      tool,
      target: targets[0] ?? "",
    };
  if (tool === "bash" && decision.effect !== "allow") {
    const command =
      args &&
      typeof args === "object" &&
      typeof (args as Record<string, unknown>).command === "string"
        ? ((args as Record<string, unknown>).command as string).trim()
        : decision.target;
    return { ...decision, target: command, matchedTarget: decision.target };
  }
  return decision;
}
