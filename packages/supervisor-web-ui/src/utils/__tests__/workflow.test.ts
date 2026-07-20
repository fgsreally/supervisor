import { describe, expect, it } from "vitest";
import { parseWorkflowState, workflowStageLabel } from "../workflow";

describe("workflow UI helpers", () => {
  it("reads a persisted workflow from Session meta", () => {
    expect(
      parseWorkflowState({ workflow: { stage: "mockup", status: "waiting_confirmation" } }),
    ).toEqual({ stage: "mockup", status: "waiting_confirmation" });
  });

  it("rejects malformed workflow metadata", () => {
    expect(parseWorkflowState({ workflow: { stage: "spec" } })).toBeNull();
    expect(parseWorkflowState({ workflow: { stage: "spec", status: "unknown" } })).toBeNull();
  });

  it("uses readable labels and preserves custom stage names", () => {
    expect(workflowStageLabel("implement")).toBe("实现验证");
    expect(workflowStageLabel("custom-review")).toBe("custom-review");
  });
});
