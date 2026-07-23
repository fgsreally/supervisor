/**
 * Shared helpers for installing resources from git / GitHub URLs.
 * Reuses the same URL shapes as extension install (github web, git+, .git remotes).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { parseGithubUrl, type ParsedGitSource } from "../extension/installer.js";

export type { ParsedGitSource };

export type GitOrLocalSource =
  | { kind: "local"; path: string }
  | ({ kind: "git" } & ParsedGitSource);

function parseGitRemote(input: string): ParsedGitSource | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("git@") && !trimmed.endsWith(".git")) return null;
  if (parseGithubUrl(trimmed)) return null;

  const idHint = trimmed
    .replace(/\.git$/, "")
    .split(/[/:]/)
    .pop();
  return idHint ? { cloneUrl: trimmed, idHint } : null;
}

function isExplicitLocalPath(input: string): boolean {
  if (input.startsWith("~/") || input.startsWith("./") || input.startsWith("../")) return true;
  if (/^[A-Za-z]:[\\/]/.test(input)) return true;
  if (input.startsWith("/")) return true;
  return false;
}

/**
 * Parse a skill/resource source string into local path or git clone info.
 * Accepts:
 * - local directory path
 * - GitHub web URL (with optional /tree/ref/subpath)
 * - git+https://...
 * - `owner/repo` or `owner/repo/path/to/skill` (resolved to github)
 */
export function parseGitOrLocalSource(input: string): GitOrLocalSource {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("source is required");

  // Prefer an existing local path over owner/repo shorthand.
  if (isExplicitLocalPath(trimmed) || existsSync(trimmed)) {
    return { kind: "local", path: trimmed };
  }

  const github = parseGithubUrl(trimmed);
  if (github) return { kind: "git", ...github };

  if (trimmed.startsWith("git+")) {
    const rest = trimmed.slice(4).trim();
    const fromPlus = parseGithubUrl(rest);
    if (fromPlus) return { kind: "git", ...fromPlus };
    return {
      kind: "git",
      cloneUrl: rest,
      idHint:
        rest
          .replace(/\.git$/, "")
          .split("/")
          .pop() ?? "resource",
    };
  }

  const gitRemote = parseGitRemote(trimmed);
  if (gitRemote) return { kind: "git", ...gitRemote };

  if (/^https?:\/\//.test(trimmed)) {
    return {
      kind: "git",
      cloneUrl: trimmed.endsWith(".git") ? trimmed : `${trimmed}.git`,
      idHint:
        trimmed
          .replace(/\.git$/, "")
          .split("/")
          .pop() ?? "resource",
    };
  }

  // owner/repo@skill-name (skills.sh install shorthand)
  const atSkill = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([A-Za-z0-9_.-]+)$/.exec(trimmed);
  if (atSkill) {
    return {
      kind: "git",
      cloneUrl: `https://github.com/${atSkill[1]}.git`,
      idHint: atSkill[2],
    };
  }

  // owner/repo or owner/repo/skills/foo
  const shorthand = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(.+))?$/.exec(trimmed);
  if (shorthand && !isAbsolute(trimmed) && !trimmed.startsWith(".")) {
    const owner = shorthand[1];
    const repo = shorthand[2];
    const subpath = shorthand[3]?.replace(/\/$/, "");
    return {
      kind: "git",
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      subpath: subpath || undefined,
      idHint: subpath ? (subpath.split("/").pop() ?? repo) : repo,
    };
  }

  // Bare local directory name that does not exist yet — still treat as local for clearer errors.
  if (!trimmed.includes(":") && !trimmed.includes("/")) {
    return { kind: "local", path: trimmed };
  }

  throw new Error(
    "Unrecognized source. Use a local path, GitHub URL, or owner/repo[/path] shorthand.",
  );
}

/** Clone a git source into a temp directory and return the resolved content root. Caller must clean up. */
export function cloneGitSourceToTemp(source: ParsedGitSource): { tempRoot: string; contentRoot: string } {
  const tempRoot = mkdtempSync(join(tmpdir(), "pi-resource-git-"));
  const cloneArgs = ["clone", "--depth", "1"];
  if (source.ref) cloneArgs.push("--branch", source.ref);

  const cloneRes = spawnSync("git", [...cloneArgs, source.cloneUrl, tempRoot], {
    encoding: "utf-8",
    cwd: process.cwd(),
  });
  if (cloneRes.status !== 0) {
    rmSync(tempRoot, { recursive: true, force: true });
    throw new Error(
      `git clone ${source.cloneUrl} failed: ${(cloneRes.stderr ?? "").slice(0, 500)}`,
    );
  }

  if (source.subpath) {
    const contentRoot = join(tempRoot, source.subpath);
    if (!existsSync(contentRoot) || !statSync(contentRoot).isDirectory()) {
      rmSync(tempRoot, { recursive: true, force: true });
      throw new Error(`Subpath not found in repository: ${source.subpath}`);
    }
    return { tempRoot, contentRoot };
  }

  return { tempRoot, contentRoot: tempRoot };
}

/** Find a skill directory that contains SKILL.md inside a cloned/local root. */
export function resolveSkillDirectory(root: string, preferredSlug?: string): string {
  const skillMd = join(root, "SKILL.md");
  if (existsSync(skillMd) && statSync(skillMd).isFile()) {
    return root;
  }

  const candidates = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => join(root, entry.name))
    .filter((dir) => existsSync(join(dir, "SKILL.md")));

  if (preferredSlug) {
    const preferred = candidates.find((dir) => basename(dir) === preferredSlug);
    if (preferred) return preferred;
  }

  if (candidates.length === 1) return candidates[0];

  // Common layout: skills/<name>/SKILL.md
  const skillsDir = join(root, "skills");
  if (existsSync(skillsDir) && statSync(skillsDir).isDirectory()) {
    return resolveSkillDirectory(skillsDir, preferredSlug);
  }

  if (candidates.length === 0) {
    throw new Error("No SKILL.md found in source. Point to a skill directory or subpath.");
  }
  throw new Error(
    `Multiple skills found (${candidates.map((d) => basename(d)).join(", ")}). Specify a subpath.`,
  );
}
