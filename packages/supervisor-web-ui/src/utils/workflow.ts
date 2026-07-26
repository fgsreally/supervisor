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

/**
 * Resolve the current workflow stage for a session. Prefers the top-level
 * `stage` column; falls back to the legacy `meta.workflow.stage` shape for
 * sessions created before the column existed.
 */
export function parseSessionStage(session: {
  stage?: string | null;
  meta?: Record<string, unknown>;
}): string | null {
  if (typeof session.stage === "string" && session.stage) return session.stage;
  const workflow = session.meta?.workflow;
  if (workflow && typeof workflow === "object") {
    const stage = (workflow as Record<string, unknown>).stage;
    if (typeof stage === "string" && stage) return stage;
  }
  return null;
}

export function workflowStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}
