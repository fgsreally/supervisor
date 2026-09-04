import { dependencyFingerprint, findReusableDependencyRoot } from "./fingerprint.js";
import { detectProjectSetup } from "./detect.js";
import type { InstallDecision, ProjectSetup, ProjectSetupSummary } from "./types.js";

export * from "./detect.js";
export * from "./fingerprint.js";
export * from "./types.js";

export function summarizeProjectSetup(
  cwd: string,
  setup: ProjectSetup | null,
): ProjectSetupSummary | undefined {
  if (!setup) return undefined;
  const fingerprint = dependencyFingerprint(cwd, setup);
  return {
    provider: setup.provider,
    ...(setup.packageManager ? { packageManager: setup.packageManager } : {}),
    ...(setup.installCommand ? { installCommand: setup.installCommand } : {}),
    dependencyFiles: setup.dependencyFiles,
    source: setup.source,
    ...(fingerprint ? { fingerprint } : {}),
  };
}

export function resolveInstallDecision(
  cwd: string,
  requestedCommand?: string,
  options?: { preferRequestedCommand?: boolean },
): InstallDecision {
  const setup = detectProjectSetup(cwd);
  const requested = requestedCommand?.trim();
  const installCommand = options?.preferRequestedCommand
    ? requested || setup?.installCommand
    : setup?.installCommand;
  if (!installCommand) {
    return {
      action: "skip",
      setup: setup ?? undefined,
      reason: setup
        ? `No deterministic install command for ${setup.provider}`
        : "Project type not recognized",
    };
  }

  if (setup) {
    const reusable = findReusableDependencyRoot(cwd, setup);
    if (reusable) {
      return {
        action: "reuse",
        installCommand,
        setup,
        fingerprint: reusable.fingerprint,
        matchedRoot: reusable.root,
        reason: `Dependency fingerprint matches ${reusable.root}`,
      };
    }
  }

  return {
    action: "install",
    installCommand,
    setup: setup ?? undefined,
    fingerprint: setup ? dependencyFingerprint(cwd, setup) : undefined,
    reason: setup ? "No matching reusable dependency root" : "Explicit install command",
  };
}
