import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionJobsPopover from "../SessionJobsPopover.vue";

const { getSessionJobs, cancelSessionJob, sendSessionJobInput } = vi.hoisted(() => ({
  getSessionJobs: vi.fn(),
  cancelSessionJob: vi.fn(),
  sendSessionJobInput: vi.fn(),
}));

vi.mock("@/api", () => ({
  getSessionJobs,
  cancelSessionJob,
  sendSessionJobInput,
}));

describe("SessionJobsPopover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionJobs.mockResolvedValue({
      schedules: [
        {
          id: "schedule-1",
          sessionId: 1,
          kind: "timer",
          name: "timer.fire",
          label: "检查部署",
          prompt: "check deploy",
          nextRunAt: Date.now() + 60_000,
          intervalMs: 300_000,
          metadata: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      jobs: [
        {
          id: "job-1",
          sessionId: 1,
          kind: "shell",
          name: "persistent-bash",
          label: "pnpm test",
          status: "running",
          executionMode: "background",
          capabilities: ["cancel", "input", "read_output"],
          output: "tests running",
          metadata: {},
          createdAt: Date.now(),
          startedAt: Date.now(),
        },
      ],
    });
  });

  it("combines schedules and running jobs in one popover", async () => {
    const wrapper = mount(SessionJobsPopover, { props: { sessionId: "1" } });
    await flushPromises();

    expect(wrapper.get(".jobs-summary").text()).toBe("2");
    await wrapper.get(".jobs-summary").trigger("click");
    expect(wrapper.text()).toContain("检查部署");
    expect(wrapper.text()).toContain("每 5 分钟");
    expect(wrapper.text()).toContain("pnpm test");

    const jobButtons = wrapper.findAll(".job-item");
    await jobButtons[1]!.trigger("click");
    expect(wrapper.text()).toContain("tests running");
  });

  it("sends long output to the split detail presentation", async () => {
    getSessionJobs.mockResolvedValue({
      schedules: [],
      jobs: [
        {
          id: "job-long",
          sessionId: 1,
          kind: "shell",
          name: "persistent-bash",
          label: "long test",
          status: "succeeded",
          executionMode: "background",
          capabilities: ["read_output"],
          output: "line\n".repeat(30),
          metadata: {},
          createdAt: Date.now(),
          finishedAt: Date.now(),
        },
      ],
    });
    const wrapper = mount(SessionJobsPopover, { props: { sessionId: "1" } });
    await flushPromises();
    await wrapper.get(".jobs-summary").trigger("click");
    await wrapper.get(".job-item").trigger("click");

    expect(wrapper.emitted("detail")?.[0]?.[0]).toMatchObject({ presentation: "panel" });
  });
});
