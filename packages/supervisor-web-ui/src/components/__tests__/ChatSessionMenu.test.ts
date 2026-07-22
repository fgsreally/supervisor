import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ChatSessionMenu from "../ChatSessionMenu.vue";

describe("ChatSessionMenu", () => {
  it("only exposes an enable switch for the shadow agent", async () => {
    const wrapper = mount(ChatSessionMenu, {
      props: {
        open: true,
        agentName: "Main",
        sessionTitle: "Session",
        avatarLabel: "M",
        avatarColor: "#000",
        muted: false,
        showThinking: false,
        childSessions: [],
        configurableAgents: [],
        shadowEnabled: true,
        spawnedAgentIds: [],
      },
      global: {
        stubs: { Teleport: true, Transition: false },
      },
    });

    const toggle = wrapper.get('[aria-label="启用影子代理"]');
    expect(toggle.attributes("aria-checked")).toBe("true");
    expect(wrapper.find(".session-agent-card__builtin").exists()).toBe(false);

    await toggle.trigger("click");
    expect(wrapper.emitted("update:shadowEnabled")?.[0]).toEqual([false]);
  });
});
