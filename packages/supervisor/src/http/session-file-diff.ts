import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { normalize, relative, resolve, sep } from "node:path";

const MAX_DIFF_LINES = 500;
const MAX_DIFF_BYTES = 512 * 1024;

export interface SessionFileDiffLine {
  type: "context" | "add" | "del";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export type SessionFileDiffStatus = "added" | "modified" | "deleted" | "unchanged" | "binary";

export interface SessionFileDiff {
  path: string;
  status: SessionFileDiffStatus;
  lines: SessionFileDiffLine[];
  truncated?: boolean;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function resolveUnderRoot(root: string, relPath: string): string {
  const rootAbs = normalize(resolve(root));
  const cleaned = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("\0")) {
    throw new Error("invalid path");
  }
  const abs = normalize(resolve(rootAbs, cleaned));
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    throw new Error("path is outside session workspace");
  }
  return abs;
}

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: MAX_DIFF_BYTES,
      windowsHide: true,
    }).trim();
  } catch (error) {
    if (error && typeof error === "object" && "stdout" in error) {
      const stdout = (error as { stdout?: unknown }).stdout;
      if (typeof stdout === "string") return stdout.trim();
    }
    return "";
  }
}

function isGitRepo(cwd: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      stdio: "ignore",
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function getPorcelainLine(cwd: string, relPath: string): string {
  const output = runGit(cwd, ["status", "--porcelain", "--", relPath]);
  const line = output.split(/\r?\n/).find((entry) => entry.length >= 4);
  return line ?? "";
}

function isTracked(cwd: string, relPath: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", relPath], {
      cwd,
      stdio: "ignore",
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function runGitDiff(cwd: string, relPath: string, absPath: string): string {
  const tracked = isTracked(cwd, relPath);
  const exists = existsSync(absPath);

  if (tracked || exists) {
    const diff = runGit(cwd, ["diff", "-U9999", "HEAD", "--", relPath]);
    if (diff) return diff;
  }

  if (!tracked && exists) {
    const tempDir = mkdtempSync(joinTmp("supervisor-diff-"));
    const emptyFile = resolve(tempDir, ".empty");
    writeFileSync(emptyFile, "");
    try {
      return runGit(cwd, ["diff", "-U9999", "--no-index", emptyFile, absPath]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  if (tracked && !exists) {
    return runGit(cwd, ["diff", "-U9999", "HEAD", "--", relPath]);
  }

  return "";
}

function joinTmp(prefix: string): string {
  return resolve(tmpdir(), prefix);
}

function inferStatusFromDiff(raw: string, porcelain: string): SessionFileDiffStatus {
  const code = porcelain.slice(0, 2);
  if (code.includes("D")) return "deleted";
  if (code === "??" || code.includes("A")) return "added";

  if (/^---\s+\/dev\/null/m.test(raw) || /^---\s+dev\/null/m.test(raw)) return "added";
  if (/^\+\+\+\s+\/dev\/null/m.test(raw) || /^\+\+\+\s+dev\/null/m.test(raw)) return "deleted";

  if (porcelain.trim()) return "modified";
  return "modified";
}

/** Parse unified diff output into inline diff lines. Exported for tests. */
export function parseUnifiedDiff(
  raw: string,
  maxLines = MAX_DIFF_LINES,
): { lines: SessionFileDiffLine[]; truncated: boolean } {
  const result: SessionFileDiffLine[] = [];
  let truncated = false;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("@@")) {
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = Number(match[1]);
        newLine = Number(match[2]);
        inHunk = true;
      }
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("\\")) continue;

    if (result.length >= maxLines) {
      truncated = true;
      break;
    }

    if (line.startsWith("+")) {
      result.push({ type: "add", content: line.slice(1), newLineNo: newLine });
      newLine += 1;
    } else if (line.startsWith("-")) {
      result.push({ type: "del", content: line.slice(1), oldLineNo: oldLine });
      oldLine += 1;
    } else if (line.startsWith(" ")) {
      result.push({
        type: "context",
        content: line.slice(1),
        oldLineNo: oldLine,
        newLineNo: newLine,
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  return { lines: result, truncated };
}

/** Diff a session workspace file against git HEAD (uncommitted changes). */
export function readSessionWorkspaceFileDiff(cwd: string, relPath: string): SessionFileDiff {
  const abs = resolveUnderRoot(cwd, relPath);
  const path = toPosix(relative(normalize(resolve(cwd)), abs));

  if (!isGitRepo(cwd)) {
    return { path, status: "unchanged", lines: [] };
  }

  const raw = runGitDiff(cwd, path, abs);
  if (/Binary files .* differ/i.test(raw)) {
    return { path, status: "binary", lines: [] };
  }

  if (!raw.trim()) {
    return { path, status: "unchanged", lines: [] };
  }

  const porcelain = getPorcelainLine(cwd, path);
  const status = inferStatusFromDiff(raw, porcelain);
  const { lines, truncated } = parseUnifiedDiff(raw);
  return { path, status, lines, ...(truncated ? { truncated: true } : {}) };
}
