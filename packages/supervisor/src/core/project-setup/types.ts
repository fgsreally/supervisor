export type ProjectSetupProvider =
  | "node"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "php"
  | "ruby"
  | "deno"
  | "cpp";

/** Deterministic setup information derived from project files. */
export interface ProjectSetup {
  provider: ProjectSetupProvider;
  packageManager?: string;
  installCommand?: string;
  dependencyFiles: string[];
  source: string;
  /** Only providers listed here may reuse dependencies from an ancestor. */
  reusableDependencyDirectories?: string[];
}

export interface ProjectSetupSummary {
  provider: ProjectSetupProvider;
  packageManager?: string;
  installCommand?: string;
  dependencyFiles: string[];
  source: string;
  fingerprint?: string;
}

export type InstallDecisionAction = "install" | "reuse" | "skip";

export interface InstallDecision {
  action: InstallDecisionAction;
  installCommand?: string;
  setup?: ProjectSetup;
  fingerprint?: string;
  matchedRoot?: string;
  reason: string;
}
