import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { detectProjectSetup } from "./detect.js";
import type { ProjectSetup } from "./types.js";

export function dependencyFingerprint(cwd: string, setup: ProjectSetup): string | undefined {
  const hash = createHash("sha256");
  hash.update(`${setup.provider}\0${setup.packageManager ?? ""}\0`);
  for (const file of [...setup.dependencyFiles].sort()) {
    const path = join(cwd, file);
    if (!existsSync(path)) return undefined;
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function sameSetup(left: ProjectSetup, right: ProjectSetup): boolean {
  return left.provider === right.provider && left.packageManager === right.packageManager;
}

export function findReusableDependencyRoot(
  cwd: string,
  setup: ProjectSetup,
): { root: string; fingerprint: string } | undefined {
  const reusableDirectories = setup.reusableDependencyDirectories;
  if (!reusableDirectories?.length) return undefined;
  const fingerprint = dependencyFingerprint(cwd, setup);
  if (!fingerprint) return undefined;

  let current = resolve(cwd);
  for (;;) {
    const candidate = detectProjectSetup(current);
    if (candidate && sameSetup(setup, candidate)) {
      const candidateFingerprint = dependencyFingerprint(current, candidate);
      const hasDependencies = reusableDirectories.every((directory) =>
        existsSync(join(current, directory)),
      );
      if (hasDependencies && candidateFingerprint === fingerprint) {
        return { root: current, fingerprint };
      }
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
