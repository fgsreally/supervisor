const STAGE_KEYS: Record<string, string> = {
  brainstorm: "workflow.stage.brainstorm",
  design: "workflow.stage.design",
  spec: "workflow.stage.spec",
  mockup: "workflow.stage.mockup",
  planning: "workflow.stage.planning",
  test: "workflow.stage.test",
  vertical: "workflow.stage.vertical",
  implement: "workflow.stage.implement",
  archive: "workflow.stage.archive",
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
  const key = STAGE_KEYS[stage];
  return key ? t(key) : stage;
}
import { translate as t } from "@/i18n";
