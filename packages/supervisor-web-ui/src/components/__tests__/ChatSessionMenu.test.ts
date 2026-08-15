import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ChatSessionMenu from "../session/ChatSessionMenu.vue";

const baseProps = {
  open: true,
  agentName: "Main",
  sessionTitle: "Session",
  avatarLabel: "M",
  avatarColor: "#000",
  muted: false,
  showThinking: false,
  splitAssistantMessages: false,
  childSessions: [],
  configurableAgents: [],
  shadowEnabled: true,
  spawnedAgentIds: [],
};

describe("ChatSessionMenu", () => {
  it("only exposes an enable switch for Shadow observation", async () => {
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
    expect(wrapper.text()).not.toContain("外部 Agent");
    expect(wrapper.text()).toContain("仅显示结论");
  });

  it("opens a dialog to pick available subagents", async () => {
    const wrapper = mount(ChatSessionMenu, {
      props: {
        ...baseProps,
        configurableAgents: [
          { id: "a1", name: "Coder", avatar: null },
          { id: "a2", name: "Reviewer", avatar: null },
        ] as never[],
        spawnedAgentIds: ["a1"],
      },
      global: {
        stubs: { Teleport: true, Transition: false },
      },
    });

    await wrapper.get('[aria-label="添加子代理"]').trigger("click");
    expect(wrapper.text()).toContain("选择子代理");
    expect(wrapper.text()).toContain("Reviewer");
    expect(wrapper.find(".session-agent-picker").exists()).toBe(true);
  });
});
