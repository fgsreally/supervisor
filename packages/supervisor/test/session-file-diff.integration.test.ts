import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSessionWorkspaceFileDiff } from "../src/http/session-file-diff.js";

function runGit(cwd: string, args: string[]) {
  execFileSync("git", args, { cwd, stdio: "ignore", windowsHide: true });
}

describe("readSessionWorkspaceFileDiff", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeRepo() {
    const dir = mkdtempSync(join(tmpdir(), "supervisor-diff-int-"));
    dirs.push(dir);
    runGit(dir, ["init", "-b", "main"]);
    writeFileSync(join(dir, "README.md"), "hello\n");
    runGit(dir, ["add", "README.md"]);
    runGit(dir, ["commit", "-m", "init"]);
    return dir;
  }

  it("returns modified diff vs HEAD", () => {
    const dir = makeRepo();
    writeFileSync(join(dir, "README.md"), "hello world\n");
    const diff = readSessionWorkspaceFileDiff(dir, "README.md");
    expect(diff.status).toBe("modified");
    expect(diff.lines.some((line) => line.type === "add")).toBe(true);
  });

  it("returns added diff for untracked file", () => {
    const dir = makeRepo();
    writeFileSync(join(dir, "new.ts"), "export const x = 1;\n");
    const diff = readSessionWorkspaceFileDiff(dir, "new.ts");
    expect(diff.status).toBe("added");
    expect(diff.lines.every((line) => line.type === "add")).toBe(true);
  });

  it("returns deleted diff when file removed", () => {
    const dir = makeRepo();
    rmSync(join(dir, "README.md"));
    const diff = readSessionWorkspaceFileDiff(dir, "README.md");
    expect(diff.status).toBe("deleted");
    expect(diff.lines.some((line) => line.type === "del")).toBe(true);
  });

  it("returns unchanged when clean", () => {
    const dir = makeRepo();
    const diff = readSessionWorkspaceFileDiff(dir, "README.md");
    expect(diff.status).toBe("unchanged");
    expect(diff.lines).toEqual([]);
  });
});
