export interface WorkflowState {
  stage: string;
  status: "working" | "waiting_confirmation" | "waiting_choice" | "completed";
}

const STAGE_LABELS: Record<string, string> = {
  brainstorm: "需求探索",
  design: "技术设计",
  spec: "规格",
  mockup: "小样",
  planning: "规划",
  test: "测试",
  vertical: "逐项交付",
  implement: "实现验证",
  archive: "归档",
};

export function parseWorkflowState(
  meta: Record<string, unknown> | undefined,
): WorkflowState | null {
  const value = meta?.workflow;
  if (!value || typeof value !== "object") return null;
  const workflow = value as Record<string, unknown>;
  if (typeof workflow.stage !== "string" || typeof workflow.status !== "string") return null;
  if (
    !["working", "waiting_confirmation", "waiting_choice", "completed"].includes(workflow.status)
  ) {
    return null;
  }
  return workflow as unknown as WorkflowState;
}

export function workflowStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}
