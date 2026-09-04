import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockSession } from "@/utils/test-utils";
import { viewPreferences } from "@/utils/view-preferences";

const {
  notifyMessageComplete,
  notifyAskUserInput,
  notifySessionError,
  subscribeSessionStatusEvents,
  routerPush,
  currentRoute,
} = vi.hoisted(() => ({
  notifyMessageComplete: vi.fn(),
  notifyAskUserInput: vi.fn(),
  notifySessionError: vi.fn(),
  subscribeSessionStatusEvents: vi.fn(
    (
      _listener: (
        sessionId: string,
        event: { type: "session_status"; status: "idle" | "running"; timestamp: number },
      ) => void,
    ) => vi.fn(),
  ),
  routerPush: vi.fn(),
  currentRoute: { path: "/chat" },
}));

vi.mock("../use-notifications", () => ({
  notifyMessageComplete,
  notifyAskUserInput,
  notifySessionError,
}));

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    subscribeSessionStatusEvents,
  };
});

vi.mock("@/router", () => ({
  default: {
    currentRoute: { value: currentRoute },
    push: routerPush,
    replace: vi.fn(),
  },
}));

import { useSessionStore } from "@/store";
import {
  initSessionNotifyWatch,
  notifyKindForStatusChange,
  resetSessionNotifyWatchForTests,
} from "../use-session-notify-watch";

describe("notifyKindForStatusChange", () => {
  it("notifies complete when leaving an active status for idle", () => {
    expect(notifyKindForStatusChange("running", "idle")).toBe("complete");
    expect(notifyKindForStatusChange("blocked", "idle")).toBe("complete");
    expect(notifyKindForStatusChange("initializing", "idle")).toBe("complete");
  });

  it("notifies error when entering error", () => {
    expect(notifyKindForStatusChange("running", "error")).toBe("error");
    expect(notifyKindForStatusChange("idle", "error")).toBe("error");
  });

  it("notifies ask when entering blocked", () => {
    expect(notifyKindForStatusChange("running", "blocked")).toBe("ask");
    expect(notifyKindForStatusChange("initializing", "blocked")).toBe("ask");
  });

  it("ignores first sighting and no-ops", () => {
    expect(notifyKindForStatusChange(undefined, "idle")).toBeNull();
    expect(notifyKindForStatusChange("idle", "idle")).toBeNull();
    expect(notifyKindForStatusChange("running", "running")).toBeNull();
    expect(notifyKindForStatusChange("idle", "running")).toBeNull();
  });
});

describe("initSessionNotifyWatch", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetSessionNotifyWatchForTests();
    notifyMessageComplete.mockReset();
    notifyAskUserInput.mockReset();
    notifySessionError.mockReset();
    subscribeSessionStatusEvents.mockReset();
    subscribeSessionStatusEvents.mockReturnValue(vi.fn());
    currentRoute.path = "/chat";
    viewPreferences.mutedSessionIds = [];
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    resetSessionNotifyWatchForTests();
  });

  it("notifies once when a non-builtin session goes idle", async () => {
    const store = useSessionStore();
    store.sessions = [
      createMockSession({ id: "s1", status: "running", isBuiltin: false, title: "Alpha" }),
    ];
    initSessionNotifyWatch();
    store.sessions[0].status = "idle";
    await nextTick();
    expect(notifyMessageComplete).toHaveBeenCalledTimes(1);
    expect(notifyMessageComplete).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "s1", sessionName: "Alpha" }),
    );
    store.sessions[0].status = "idle";
    await nextTick();
    expect(notifyMessageComplete).toHaveBeenCalledTimes(1);
  });

  it("updates an idle session when the global status stream reports it running", async () => {
    const store = useSessionStore();
    store.sessions = [createMockSession({ id: "s1", status: "idle", isBuiltin: false })];
    initSessionNotifyWatch();
    const listener = subscribeSessionStatusEvents.mock.calls[0][0];
    listener("s1", { type: "session_status", status: "running", timestamp: Date.now() });
    await nextTick();
    expect(store.sessions[0].status).toBe("running");
  });

  it("notifies error and ask transitions", async () => {
    const store = useSessionStore();
    store.sessions = [createMockSession({ id: "s1", status: "running", isBuiltin: false })];
    initSessionNotifyWatch();
    store.sessions[0].status = "blocked";
    await nextTick();
    expect(notifyAskUserInput).toHaveBeenCalledTimes(1);
    store.sessions[0].status = "error";
    await nextTick();
    expect(notifySessionError).toHaveBeenCalledTimes(1);
  });

  it("skips builtin, muted, and the currently visible session", async () => {
    const store = useSessionStore();
    store.sessions = [
      createMockSession({ id: "builtin", status: "running", isBuiltin: true, title: "Watson" }),
      createMockSession({ id: "muted", status: "running", isBuiltin: false, title: "Muted" }),
      createMockSession({ id: "open", status: "running", isBuiltin: false, title: "Open" }),
    ];
    viewPreferences.mutedSessionIds = ["muted"];
    currentRoute.path = "/chat/open";
    initSessionNotifyWatch();
    for (const session of store.sessions) session.status = "idle";
    await nextTick();
    expect(notifyMessageComplete).not.toHaveBeenCalled();
  });
});
