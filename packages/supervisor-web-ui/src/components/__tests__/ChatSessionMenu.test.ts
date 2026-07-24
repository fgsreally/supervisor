import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ChatSessionMenu from "../ChatSessionMenu.vue";

const baseProps = {
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
};

describe("ChatSessionMenu", () => {
  it("only exposes an enable switch for the shadow agent", async () => {
    const wrapper = mount(ChatSessionMenu, {
      props: baseProps,
      global: {
        stubs: { Teleport: true, Transition: false },
      },
    });

    expect(wrapper.text()).toContain("聊天标题");
    const toggle = wrapper.get('[aria-label="启用影子代理"]');
    expect(toggle.attributes("aria-checked")).toBe("true");
    expect(wrapper.find(".session-agent-card__builtin").exists()).toBe(false);

    await toggle.trigger("click");
    expect(wrapper.emitted("update:shadowEnabled")?.[0]).toEqual([false]);
  });

  it("hides shadow and subagent settings for external agents", () => {
    const wrapper = mount(ChatSessionMenu, {
      props: {
        ...baseProps,
        externalAgent: true,
      },
      global: {
        stubs: { Teleport: true, Transition: false },
      },
    });

    expect(wrapper.find('[aria-label="启用影子代理"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("可用子代理");
    expect(wrapper.text()).toContain("外部 Agent");
  });
});
