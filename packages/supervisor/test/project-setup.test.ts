import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectProjectSetup, resolveInstallDecision } from "../src/core/project-setup/index.js";

function tempProject(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("project setup detection", () => {
  it("detects common package managers and lockfile-safe commands", () => {
    const dir = tempProject("sv-setup-node-");
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ packageManager: "pnpm@10.0.0" }));
      writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      expect(detectProjectSetup(dir)).toMatchObject({
        provider: "node",
        packageManager: "pnpm",
        installCommand: "pnpm install --frozen-lockfile",
        dependencyFiles: ["package.json", "pnpm-lock.yaml"],
        reusableDependencyDirectories: ["node_modules"],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reuses a matching ancestor Node dependency tree", () => {
    const root = tempProject("sv-setup-worktree-");
    const worktree = join(root, ".supervisor", "worktrees", "session");
    try {
      mkdirSync(join(root, "node_modules"));
      mkdirSync(worktree, { recursive: true });
      const packageJson = JSON.stringify({ dependencies: { vite: "^7.0.0" } });
      writeFileSync(join(root, "package.json"), packageJson);
      writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      writeFileSync(join(worktree, "package.json"), packageJson);
      writeFileSync(join(worktree, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

      expect(resolveInstallDecision(worktree)).toMatchObject({
        action: "reuse",
        matchedRoot: root,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("installs when a Node worktree dependency fingerprint changes", () => {
    const root = tempProject("sv-setup-worktree-change-");
    const worktree = join(root, ".supervisor", "worktrees", "session");
    try {
      mkdirSync(join(root, "node_modules"));
      mkdirSync(worktree, { recursive: true });
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ dependencies: { vite: "^7.0.0" } }),
      );
      writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      writeFileSync(
        join(worktree, "package.json"),
        JSON.stringify({ dependencies: { vue: "^3.5.0" } }),
      );
      writeFileSync(join(worktree, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

      expect(resolveInstallDecision(worktree).action).toBe("install");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not reuse Node ancestors without a lockfile", () => {
    const root = tempProject("sv-setup-node-no-lock-");
    const worktree = join(root, ".supervisor", "worktrees", "session");
    try {
      mkdirSync(join(root, "node_modules"));
      mkdirSync(worktree, { recursive: true });
      const packageJson = JSON.stringify({ dependencies: { vite: "^7.0.0" } });
      writeFileSync(join(root, "package.json"), packageJson);
      writeFileSync(join(worktree, "package.json"), packageJson);

      expect(resolveInstallDecision(worktree).action).toBe("install");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not apply Node ancestor reuse to Python", () => {
    const root = tempProject("sv-setup-python-");
    const worktree = join(root, ".supervisor", "worktrees", "session");
    try {
      mkdirSync(join(root, ".venv"));
      mkdirSync(worktree, { recursive: true });
      writeFileSync(join(root, "pyproject.toml"), "[project]\nname='demo'\n");
      writeFileSync(join(worktree, "pyproject.toml"), "[project]\nname='demo'\n");

      expect(resolveInstallDecision(worktree)).toMatchObject({
        action: "install",
        setup: { provider: "python" },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips unknown projects without guessing an install command", () => {
    const dir = tempProject("sv-setup-unknown-");
    try {
      expect(resolveInstallDecision(dir)).toEqual({
        action: "skip",
        reason: "Project type not recognized",
      });
      expect(resolveInstallDecision(dir, "custom-install")).toEqual({
        action: "skip",
        reason: "Project type not recognized",
      });
      expect(
        resolveInstallDecision(dir, "custom-install", { preferRequestedCommand: true }),
      ).toMatchObject({
        action: "install",
        installCommand: "custom-install",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
