import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ChatInputToolbar from "../ChatInputToolbar.vue";

describe("ChatInputToolbar", () => {
  it("turns the send action into an interrupt action while streaming", async () => {
    const wrapper = mount(ChatInputToolbar, {
      props: { interrupting: true, canSend: false },
    });
    const button = wrapper.get(".send-btn");

    expect(button.text()).toBe("");
    expect(button.attributes("aria-label")).toBe("打断当前会话");
    expect(button.find("svg").exists()).toBe(true);
    expect(button.attributes("disabled")).toBeUndefined();
    await button.trigger("click");

    expect(wrapper.emitted("interrupt")).toHaveLength(1);
    expect(wrapper.emitted("send")).toBeUndefined();
  });
});
