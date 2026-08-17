import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ResponsiveDialog from "../ResponsiveDialog/index.vue";

describe("ResponsiveDialog", () => {
  it("keeps close and backdrop dismiss when boolean props are omitted", async () => {
    const wrapper = mount(ResponsiveDialog, {
      props: { open: true, title: "选择 Agent" },
      global: { stubs: { Teleport: true, Transition: false } },
    });

    expect(wrapper.find(".m-drawer__close").exists()).toBe(true);

    await wrapper.get(".m-overlay").trigger("mousedown");
    expect(wrapper.emitted("close")).toBeTruthy();
  });
});
