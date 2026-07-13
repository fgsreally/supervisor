/**
 * Declarative tool access policy for plan mode, readonly subagents, etc.
 */

export type ToolResourceAccess = {
  kind: "file";
  mode: "read" | "write";
  pattern: string;
};

export type ToolDecision = { allow: true } | { allow: false; reason: string };

export type ToolCallInfo = {
  name: string;
  args: unknown;
};

const DEFAULT_WRITE_TOOLS = new Set(["edit", "write", "patch", "apply_patch", "ApplyPatch"]);

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern);
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function matchGlob(pattern: string, value: string): boolean {
  return globToRegExp(pattern).test(normalizePath(value));
}

export function extractFilePaths(toolName: string, args: unknown): string[] {
  if (!args || typeof args !== "object") return [];
  const record = args as Record<string, unknown>;
  const paths: string[] = [];
  for (const key of ["file_path", "filePath", "path", "file"]) {
    if (typeof record[key] === "string") paths.push(record[key]);
  }
  if (toolName === "bash" && typeof record.command === "string") {
    const redirect = /(?:^|[\s|])(?:\d*>)?>?\s*([^\s;|&]+)/.exec(record.command);
    if (redirect?.[1] && !redirect[1].startsWith("/dev/")) {
      paths.push(redirect[1]);
    }
  }
  return paths;
}

export function isWriteTool(toolName: string): boolean {
  return DEFAULT_WRITE_TOOLS.has(toolName) || DEFAULT_WRITE_TOOLS.has(toolName.toLowerCase());
}

export class ToolPolicy {
  private mode: "coding" | "readonly" | "none" = "coding";
  private allowedTools = new Set<string>();
  private deniedTools = new Set<string>();
  private allowedResources: ToolResourceAccess[] = [];
  private deniedResources: ToolResourceAccess[] = [];

  static coding(): ToolPolicy {
    return new ToolPolicy();
  }

  static readonly(): ToolPolicy {
    return new ToolPolicy().withMode("readonly");
  }

  static none(): ToolPolicy {
    return new ToolPolicy().withMode("none");
  }

  withMode(mode: "coding" | "readonly" | "none"): this {
    this.mode = mode;
    return this;
  }

  allowTool(name: string): this {
    this.allowedTools.add(name);
    this.deniedTools.delete(name);
    return this;
  }

  denyTool(name: string): this {
    this.deniedTools.add(name);
    this.allowedTools.delete(name);
    return this;
  }

  allowResource(resource: ToolResourceAccess): this {
    this.allowedResources.push(resource);
    return this;
  }

  denyResource(resource: ToolResourceAccess): this {
    this.deniedResources.push(resource);
    return this;
  }

  clone(): ToolPolicy {
    const next = new ToolPolicy().withMode(this.mode);
    for (const name of this.allowedTools) next.allowedTools.add(name);
    for (const name of this.deniedTools) next.deniedTools.add(name);
    next.allowedResources = [...this.allowedResources];
    next.deniedResources = [...this.deniedResources];
    return next;
  }

  check(call: ToolCallInfo): ToolDecision {
    const { name, args } = call;

    if (this.allowedTools.has(name)) {
      return this.checkResources(name, args, "allow-list");
    }

    if (this.deniedTools.has(name)) {
      return {
        allow: false,
        reason: `Tool "${name}" is denied by the current session tool policy.`,
      };
    }

    if (this.mode === "none") {
      return { allow: false, reason: `All tools are disabled by the current session tool policy.` };
    }

    if (this.mode === "readonly" && isWriteTool(name)) {
      const resourceDecision = this.checkWriteResources(name, args);
      if (resourceDecision) return resourceDecision;
      return {
        allow: false,
        reason: `Tool "${name}" is not allowed in readonly mode.`,
      };
    }

    const deniedResource = this.matchDeniedResources(name, args);
    if (deniedResource) {
      return { allow: false, reason: deniedResource };
    }

    if (isWriteTool(name) && this.allowedResources.length > 0) {
      const resourceDecision = this.checkWriteResources(name, args);
      if (resourceDecision?.allow === false) return resourceDecision;
    }

    return { allow: true };
  }

  filterToolNames(names: string[]): string[] {
    return names.filter((name) => this.check({ name, args: {} }).allow);
  }

  private checkResources(name: string, args: unknown, _reason: string): ToolDecision {
    if (isWriteTool(name) && this.allowedResources.length > 0) {
      const resourceDecision = this.checkWriteResources(name, args);
      if (resourceDecision) return resourceDecision;
    }
    return { allow: true };
  }

  private checkWriteResources(name: string, args: unknown): ToolDecision | undefined {
    const paths = extractFilePaths(name, args);
    if (paths.length === 0) {
      if (this.mode === "readonly" || this.allowedResources.some((r) => r.mode === "write")) {
        return {
          allow: false,
          reason: `Tool "${name}" did not declare a writable path; blocked by session tool policy.`,
        };
      }
      return undefined;
    }

    const writePatterns = this.allowedResources.filter(
      (r) => r.kind === "file" && r.mode === "write",
    );
    if (writePatterns.length === 0) return undefined;

    const allAllowed = paths.every((path) => writePatterns.some((r) => matchGlob(r.pattern, path)));
    if (!allAllowed) {
      const allowed = writePatterns.map((r) => r.pattern).join(", ");
      return {
        allow: false,
        reason: `Write blocked by session tool policy. Allowed write paths: ${allowed}`,
      };
    }
    return { allow: true };
  }

  private matchDeniedResources(name: string, args: unknown): string | undefined {
    if (!isWriteTool(name)) return undefined;
    const paths = extractFilePaths(name, args);
    for (const path of paths) {
      for (const resource of this.deniedResources) {
        if (resource.kind === "file" && matchGlob(resource.pattern, path)) {
          return `Path "${path}" is denied by session tool policy.`;
        }
      }
    }
    return undefined;
  }
}
