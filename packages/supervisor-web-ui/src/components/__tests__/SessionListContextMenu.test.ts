import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SessionListContextMenu from "../session/SessionListContextMenu.vue";

function mountMenu(status: string) {
  return mount(SessionListContextMenu, {
    props: { open: true, x: 0, y: 0, status },
    global: {
      stubs: { Teleport: true, SheetDrawer: true },
    },
  });
}

describe("SessionListContextMenu", () => {
  it("allows right-click Fork on an active session", () => {
    const wrapper = mountMenu("idle");
    expect(wrapper.text()).toContain("Fork 新会话");
    expect(wrapper.text()).toContain("完成并归档");
  });

  it("allows Fork but no further work after Achieve", () => {
    const wrapper = mountMenu("finish");
    expect(wrapper.text()).toContain("Fork 新会话");
    expect(wrapper.text()).not.toContain("完成并归档");
    expect(wrapper.text()).not.toContain("同步项目修改");
  });
});
