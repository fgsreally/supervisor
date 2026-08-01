import { describe, expect, it } from "vitest";
import {
  assertNoCycles,
  listReadyHomeTaskChildren,
  parseTodoPlanResult,
  validateHomeTaskDependencies,
} from "../src/core/home-task-plan.js";
import type { HomeTask } from "../src/types.js";

function child(partial: Partial<HomeTask> & { id: number }): HomeTask {
  return {
    title: `t${partial.id}`,
    description: "prompt",
    projectId: 1,
    status: "todo",
    priority: "normal",
    parentId: 10,
    sessionId: null,
    agentId: null,
    dependsOn: [],
    subagentIds: [],
    phase: "draft",
    error: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial,
  };
}

describe("home-task-plan", () => {
  it("parses watson plan payload and strips invalid deps", () => {
    const items = parseTodoPlanResult({
      items: [
        {
          key: "a",
          title: "Design",
          prompt: "design it",
          dependsOnKeys: ["missing"],
          projectId: 1,
          agentId: 2,
          subagentIds: [3],
        },
        {
          key: "b",
          title: "Implement",
          prompt: "code it",
          dependsOnKeys: ["a"],
        },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0]?.dependsOnKeys).toEqual([]);
    expect(items[1]?.dependsOnKeys).toEqual(["a"]);
    expect(items[0]?.subagentIds).toEqual([3]);
  });

  it("rejects cycles in key graph", () => {
    expect(() =>
      parseTodoPlanResult({
        items: [
          { key: "a", title: "A", prompt: "a", dependsOnKeys: ["b"] },
          { key: "b", title: "B", prompt: "b", dependsOnKeys: ["a"] },
        ],
      }),
    ).toThrow(/环/);
  });

  it("assertNoCycles accepts DAG", () => {
    expect(() =>
      assertNoCycles([
        { id: 1, dependsOn: [] },
        { id: 2, dependsOn: [1] },
        { id: 3, dependsOn: [1] },
      ]),
    ).not.toThrow();
  });

  it("validateHomeTaskDependencies rejects unknown sibling ids", () => {
    expect(() =>
      validateHomeTaskDependencies([child({ id: 1, dependsOn: [99] }), child({ id: 2 })]),
    ).toThrow(/无效前置/);
  });

  it("listReadyHomeTaskChildren returns only unlocked items", () => {
    const ready = listReadyHomeTaskChildren([
      child({ id: 1, status: "done" }),
      child({ id: 2, dependsOn: [1], status: "todo" }),
      child({ id: 3, dependsOn: [1], status: "todo", sessionId: 9 }),
      child({ id: 4, dependsOn: [2], status: "todo" }),
      child({ id: 5, status: "todo" }),
    ]);
    expect(ready.map((item) => item.id).sort()).toEqual([2, 5]);
  });
});
