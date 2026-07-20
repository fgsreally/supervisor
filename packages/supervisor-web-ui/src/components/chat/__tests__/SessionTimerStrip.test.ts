import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SessionTimerStrip from "../SessionTimerStrip.vue";

describe("SessionTimerStrip", () => {
  it("shows timer count and expands timer details", async () => {
    const wrapper = mount(SessionTimerStrip, {
      props: {
        timers: [
          {
            id: "deadbeef",
            prompt: "check deploy",
            createdAt: 1,
            nextFireAt: Date.now() + 60_000,
            intervalMs: 300_000,
          },
        ],
      },
    });

    expect(wrapper.get("button").text()).toBe("1");
    await wrapper.get("button").trigger("click");
    expect(wrapper.text()).toContain("check deploy");
    expect(wrapper.text()).toContain("每 5 分钟");
  });
});
