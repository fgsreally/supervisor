import { ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ChatInputToolbar from "../ChatInputToolbar.vue";
import type { VoiceRecognitionController } from "../../composables/use-voice-recognition";

function createMockVoice(): VoiceRecognitionController {
  return {
    recording: ref(false),
    partialText: ref(""),
    waveformBars: ref([4, 4, 4, 4]),
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(""),
    abort: vi.fn(),
  };
}

describe("ChatInputToolbar", () => {
  it("turns the send action into an interrupt action while streaming", async () => {
    const wrapper = mount(ChatInputToolbar, {
      props: { voice: createMockVoice(), interrupting: true, canSend: false },
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
