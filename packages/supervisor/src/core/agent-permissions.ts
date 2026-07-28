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

export function permissionPathTarget(input: string, cwd: string): string {
  const root = canonicalPath(cwd);
  const target = canonicalPath(isAbsolute(input) ? input : resolve(cwd, input));
  const rel = relative(root, target);
  const outside = rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  return outside ? `external/${slashes(target)}` : `project/${slashes(rel || ".")}`;
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

export function permissionTargets(toolName: string, args: unknown, cwd: string): string[] {
  if (!args || typeof args !== "object") return [];
  const record = args as Record<string, unknown>;
  const name = toolName.toLowerCase();
  if (name === "bash" && typeof record.command === "string") return [record.command.trim()];
  if (PATH_TOOLS.has(name)) {
    const pathKeys = new Set(["file_path", "filePath", "path", "file"]);
    return Object.entries(record).flatMap(([key, value]) => {
      if (typeof value !== "string" || value.length === 0) return [];
      return [pathKeys.has(key) ? permissionPathTarget(value, cwd) : value];
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
}

export function evaluateAgentPermission(
  rules: AgentPermissionRules,
  toolName: string,
  args: unknown,
  cwd: string,
): AgentPermissionDecision {
  const tool = toolName.toLowerCase();
  const entries = rules[tool];
  const targets = permissionTargets(tool, args, cwd);
  if (!entries || targets.length === 0) return { effect: "allow", tool, target: targets[0] ?? "" };
  const matches: AgentPermissionDecision[] = [];
  for (const target of targets) {
    for (const [pattern, effect] of Object.entries(entries)) {
      if (matchPermissionGlob(pattern, target)) matches.push({ effect, tool, target, pattern });
    }
  }
  return (
    matches.find((item) => item.effect === "deny") ??
    matches.find((item) => item.effect === "ask") ?? {
      effect: "allow",
      tool,
      target: targets[0] ?? "",
    }
  );
}
