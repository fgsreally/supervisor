import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseGitOrLocalSource,
  resolveSkillDirectory,
} from "../src/resources/git-source.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("git-source helpers", () => {
  it("parses GitHub URLs and owner/repo shorthand", () => {
    expect(parseGitOrLocalSource("anthropics/skills")).toEqual({
      kind: "git",
      cloneUrl: "https://github.com/anthropics/skills.git",
      subpath: undefined,
      idHint: "skills",
    });

    expect(parseGitOrLocalSource("owner/repo/skills/foo")).toEqual({
      kind: "git",
      cloneUrl: "https://github.com/owner/repo.git",
      subpath: "skills/foo",
      idHint: "foo",
    });

    expect(parseGitOrLocalSource("owner/repo@typescript-guide")).toEqual({
      kind: "git",
      cloneUrl: "https://github.com/owner/repo.git",
      idHint: "typescript-guide",
    });

    expect(
      parseGitOrLocalSource("https://github.com/owner/repo/tree/main/skills/bar"),
    ).toMatchObject({
      kind: "git",
      cloneUrl: "https://github.com/owner/repo.git",
      ref: "main",
      subpath: "skills/bar",
      idHint: "bar",
    });
  });

  it("prefers an existing local path over owner/repo shorthand", () => {
    const root = join(tmpdir(), `git-source-local-${Date.now()}`);
    roots.push(root);
    mkdirSync(root, { recursive: true });
    const nested = join(root, "owner", "repo");
    mkdirSync(nested, { recursive: true });

    expect(parseGitOrLocalSource(nested)).toEqual({ kind: "local", path: nested });
  });

  it("resolves a skill directory with SKILL.md", () => {
    const root = join(tmpdir(), `git-source-skill-${Date.now()}`);
    roots.push(root);
    const skillDir = join(root, "skills", "demo");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# demo\n");

    expect(resolveSkillDirectory(root, "demo")).toBe(skillDir);
  });
});
