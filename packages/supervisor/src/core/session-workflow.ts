export const WORKFLOW_STATUSES = [
  "working",
  "waiting_confirmation",
  "waiting_choice",
  "completed",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export interface SessionWorkflowState {
  stage: string;
  status: WorkflowStatus;
}

export interface WorkflowStatePatch {
  stage?: string;
  status?: WorkflowStatus;
}

export function parseWorkflowState(value: unknown): SessionWorkflowState | null {
  if (!value || typeof value !== "object") return null;
  const workflow = value as Record<string, unknown>;
  if (typeof workflow.stage !== "string" || !workflow.stage.trim()) return null;
  if (!WORKFLOW_STATUSES.includes(workflow.status as WorkflowStatus)) return null;
  return { stage: workflow.stage, status: workflow.status as WorkflowStatus };
}

export function applyWorkflowPatch(
  current: SessionWorkflowState | null,
  patch: WorkflowStatePatch,
): SessionWorkflowState {
  const stage = patch.stage ?? current?.stage;
  const status = patch.status ?? current?.status;
  if (typeof stage !== "string" || !stage.trim()) {
    throw new Error("workflow stage is required");
  }
  if (!status || !WORKFLOW_STATUSES.includes(status)) {
    throw new Error(`invalid workflow status: ${String(status)}`);
  }
  return { stage, status };
}
