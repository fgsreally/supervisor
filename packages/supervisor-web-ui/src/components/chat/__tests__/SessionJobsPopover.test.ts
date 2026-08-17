import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionJobsPopover from "../SessionJobsPopover.vue";
import { setLocale } from "@/i18n";

const { getSessionTimers } = vi.hoisted(() => ({ getSessionTimers: vi.fn() }));
vi.mock("@/api", () => ({ getSessionTimers }));

describe("SessionJobsPopover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocale("zh-CN");
    getSessionTimers.mockResolvedValue({
      timers: [{ id: "timer-1", sessionId: 1, kind: "timer", name: "timer.fire", label: "检查部署", prompt: "check deploy", nextRunAt: Date.now() + 60_000, intervalMs: 300_000, metadata: {}, createdAt: Date.now(), updatedAt: Date.now() }],
    });
  });

  it("只显示 Timer，不显示内部 Job", async () => {
    const wrapper = mount(SessionJobsPopover, { props: { sessionId: "1" } });
    await flushPromises();
    expect(wrapper.get(".chat-header-action--count").text()).toBe("1");
    await wrapper.get(".chat-header-action--count").trigger("click");
    expect(wrapper.text()).toContain("检查部署");
    expect(wrapper.text()).not.toContain("Job");
  });
});
