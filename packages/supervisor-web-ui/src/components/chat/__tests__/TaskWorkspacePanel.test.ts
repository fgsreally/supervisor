import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TaskWorkspacePanel from "../TaskWorkspacePanel.vue";

const tasks = [
  {
    path: "tasks/goal-1.md",
    type: "goal" as const,
    title: "Ship task view",
    status: "active",
    content: "---\ntype: goal\nstatus: active\n---\n\n# Goal\n\nShip task view",
  },
  {
    path: "tasks/plan-2.md",
    type: "plan" as const,
    title: "Implementation plan",
    status: "planning",
    content: "---\ntype: plan\nstatus: planning\n---\n\n# Plan\n\nVerify the UI",
  },
];

describe("TaskWorkspacePanel", () => {
  it("renders task artifacts read-only and switches the selected artifact", async () => {
    const wrapper = mount(TaskWorkspacePanel, {
      props: {
        tasks,
        todos: [{ title: "Run tests", status: "in_progress" }],
        selectedPath: tasks[0].path,
      },
    });

    expect(wrapper.text()).toContain("Goal");
    expect(wrapper.text()).toContain("Ship task view");
    expect(wrapper.findAll("input, textarea, [contenteditable=true]")).toHaveLength(0);

    await wrapper.findAll(".task-workspace__tab")[1]!.trigger("click");
    expect(wrapper.emitted("select")).toEqual([[tasks[1].path]]);

    await wrapper.setProps({ selectedPath: "$todo" });
    expect(wrapper.text()).toContain("Run tests");
  });
});
