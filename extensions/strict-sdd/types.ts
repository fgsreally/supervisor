import type { ExtensionContext } from "@earendil-works/pi-supervisor";

export type StageId =
  | "brainstorm"
  | "design"
  | "spec"
  | "mockup"
  | "planning"
  | "test"
  | "vertical"
  | "implement"
  | "archive";

export interface StageDefinition {
  id: StageId;
  prompt: string;
  allow: string[];
  deny: string[];
  requiredArtifacts: string[];
  next: StageId[];
  choice?: boolean;
}

export interface TestCommand {
  command: string;
  args: string[];
  cwd?: string;
}

export interface PlannedChange {
  id: string;
  title: string;
  specPaths: string[];
  tasks: string[];
  files: string[];
  test: TestCommand;
  maxIterations?: number;
}

export interface WorkflowPlan {
  changes: PlannedChange[];
}

export type ChangeProgressStatus =
  | "pending"
  | "tests_written"
  | "implementing"
  | "ready_to_archive"
  | "archived"
  | "blocked";

export interface ChangeProgress {
  id: string;
  status: ChangeProgressStatus;
  testSessionId?: number;
  implementSessionId?: number;
  verifySessionIds?: number[];
  iterations?: number;
  lastFailure?: string;
}

export interface ExecutionState {
  route: "tests-first" | "vertical" | null;
  changes: ChangeProgress[];
}

export type StrictSddContext = ExtensionContext;
