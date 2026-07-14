/**
 * Parse extension install sources: GitHub URLs, git remotes, npm, local paths.
 */

export interface ParsedGitSource {
  /** URL passed to `git clone`. */
  cloneUrl: string;
  /** Branch or tag (from /tree/... in GitHub URLs). */
  ref?: string;
  /** Subdirectory inside the cloned repo (monorepo packages). */
  subpath?: string;
  /** Suggested install directory name. */
  idHint: string;
}

const GITHUB_WEB_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(?:\/(.+?))?)?\/?$/i;

/**
 * Parse a GitHub web URL into clone parameters.
 *
 * Supported:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo/tree/branch
 * - https://github.com/owner/repo/tree/branch/packages/my-ext
 */
export function parseGithubUrl(input: string): ParsedGitSource | null {
  const trimmed = input.trim();
  const match = GITHUB_WEB_RE.exec(trimmed);
  if (!match) return null;

  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "");
  const ref = match[3];
  const subpath = match[4]?.replace(/\/$/, "");

  return {
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    ref,
    subpath: subpath || undefined,
    idHint: subpath ? (subpath.split("/").pop() ?? repo) : repo,
  };
}

export function parseGitRemote(input: string): ParsedGitSource | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("git@") && !trimmed.endsWith(".git")) return null;
  if (parseGithubUrl(trimmed)) return null;

  const idHint = trimmed
    .replace(/\.git$/, "")
    .split(/[/:]/)
    .pop();
  if (!idHint) return null;

  return {
    cloneUrl: trimmed,
    idHint,
  };
}

export type ExtensionSource =
  | { kind: "npm"; spec: string }
  | { kind: "git"; cloneUrl: string; ref?: string; subpath?: string; idHint: string }
  | { kind: "local"; path: string };

export function parseExtensionSource(input: string): ExtensionSource {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Extension source is required");

  if (trimmed.startsWith("npm:")) {
    return { kind: "npm", spec: trimmed.slice(4).trim() };
  }

  const github = parseGithubUrl(trimmed);
  if (github) {
    return { kind: "git", ...github };
  }

  if (trimmed.startsWith("git+")) {
    const rest = trimmed.slice(4).trim();
    const githubFromGitPlus = parseGithubUrl(rest);
    if (githubFromGitPlus) {
      return { kind: "git", ...githubFromGitPlus };
    }
    return {
      kind: "git",
      cloneUrl: rest,
      idHint:
        rest
          .replace(/\.git$/, "")
          .split("/")
          .pop() ?? "extension",
    };
  }

  const gitRemote = parseGitRemote(trimmed);
  if (gitRemote) {
    return { kind: "git", ...gitRemote };
  }

  if (/^https?:\/\//.test(trimmed)) {
    return {
      kind: "git",
      cloneUrl: trimmed.endsWith(".git") ? trimmed : `${trimmed}.git`,
      idHint:
        trimmed
          .replace(/\.git$/, "")
          .split("/")
          .pop() ?? "extension",
    };
  }

  if (isLocalPath(trimmed)) {
    return { kind: "local", path: trimmed };
  }

  return { kind: "npm", spec: trimmed };
}

function isLocalPath(input: string): boolean {
  if (input.startsWith("~/") || input.startsWith("./") || input.startsWith("../")) return true;
  if (/^[A-Za-z]:[\\/]/.test(input)) return true;
  if (input.startsWith("/")) return true;
  if (!input.includes(":")) return true;
  return false;
}

export type PackageRepository = string | { type?: string; url: string; directory?: string };

function normalizeCloneUrl(url: string): string {
  const trimmed = url.trim().replace(/^git\+/, "");
  if (parseGithubUrl(trimmed)) {
    return parseGithubUrl(trimmed)!.cloneUrl;
  }
  if (trimmed.startsWith("git@")) return trimmed;
  return trimmed.endsWith(".git") ? trimmed : `${trimmed}.git`;
}

/**
 * Resolve package.json `repository` into git clone parameters for update.
 */
export function repositoryToGitSource(
  repository: PackageRepository,
): Extract<ExtensionSource, { kind: "git" }> | null {
  let url: string;
  let directory: string | undefined;

  if (typeof repository === "string") {
    const trimmed = repository.trim();
    if (trimmed.startsWith("github:")) {
      const slug = trimmed.slice("github:".length);
      const [owner, repoName] = slug.split("/");
      if (!owner || !repoName) return null;
      url = `https://github.com/${owner}/${repoName.replace(/\.git$/, "")}.git`;
    } else {
      url = trimmed;
    }
  } else {
    url = repository.url;
    directory = repository.directory;
  }

  const github = parseGithubUrl(url);
  if (github) {
    const subpath = directory ?? github.subpath;
    return {
      kind: "git",
      cloneUrl: github.cloneUrl,
      ref: github.ref,
      subpath,
      idHint: subpath?.split("/").filter(Boolean).pop() ?? github.idHint,
    };
  }

  const gitRemote = parseGitRemote(url);
  if (gitRemote) {
    return {
      kind: "git",
      cloneUrl: gitRemote.cloneUrl,
      ref: gitRemote.ref,
      subpath: directory ?? gitRemote.subpath,
      idHint: gitRemote.idHint,
    };
  }

  if (/^https?:\/\//.test(url) || url.startsWith("git@")) {
    const cloneUrl = normalizeCloneUrl(url);
    const idHint =
      directory?.split("/").filter(Boolean).pop() ??
      cloneUrl
        .replace(/\.git$/, "")
        .split("/")
        .pop() ??
      "extension";
    return { kind: "git", cloneUrl, subpath: directory, idHint };
  }

  return null;
}
