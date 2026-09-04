/** Resolve which project an absolute path belongs to (for @@ cross-project mentions). */

export interface ProjectPathRef {
  id: string;
  name: string;
  cwd: string;
}

export function normalizePathForCompare(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function isAbsoluteFilesystemPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith("/") || normalized.startsWith("//");
}

/** Longest-prefix match of path against project cwds. */
export function findProjectByPath(
  path: string,
  projects: ProjectPathRef[],
): { project: ProjectPathRef; relativePath: string } | null {
  if (!path || path === ".") return null;
  const normalized = normalizePathForCompare(path);
  let best: ProjectPathRef | null = null;
  let bestLen = -1;

  for (const project of projects) {
    const root = normalizePathForCompare(project.cwd);
    if (!root) continue;
    if (normalized === root || normalized.startsWith(`${root}/`)) {
      if (root.length > bestLen) {
        best = project;
        bestLen = root.length;
      }
    }
  }

  if (!best) return null;
  const root = normalizePathForCompare(best.cwd);
  const relativePath = normalized === root ? "." : normalized.slice(root.length + 1);
  return { project: best, relativePath: relativePath || "." };
}

/**
 * Project name to show on a file mention chip when the path is outside the
 * current session workspace (typically from @@ picks).
 */
export function getExternalProjectSource(
  path: string,
  projects: ProjectPathRef[],
  currentCwd?: string | null,
): string | null {
  if (!isAbsoluteFilesystemPath(path)) return null;

  if (currentCwd) {
    const current = normalizePathForCompare(currentCwd);
    const normalized = normalizePathForCompare(path);
    if (current && (normalized === current || normalized.startsWith(`${current}/`))) {
      return null;
    }
  }

  const match = findProjectByPath(path, projects);
  return match?.project.name ?? null;
}
