import { describe, expect, it } from "vitest";
import { parseSessionStage, workflowStageLabel } from "../workflow";

describe("workflow UI helpers", () => {
  it("prefers the top-level stage column", () => {
    expect(parseSessionStage({ stage: "mockup" })).toBe("mockup");
  });

  it("falls back to the legacy meta.workflow.stage shape", () => {
    expect(parseSessionStage({ meta: { workflow: { stage: "spec" } } })).toBe("spec");
  });

  it("returns null when no stage is present", () => {
    expect(parseSessionStage({})).toBeNull();
    expect(parseSessionStage({ meta: {} })).toBeNull();
  });

  it("uses readable labels and preserves custom stage names", () => {
    expect(workflowStageLabel("implement")).toBe("实现验证");
    expect(workflowStageLabel("custom-review")).toBe("custom-review");
  });
});
