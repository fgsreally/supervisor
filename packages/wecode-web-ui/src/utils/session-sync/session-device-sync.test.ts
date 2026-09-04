import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/api";
import { SessionDeviceSync } from "./session-device-sync";

vi.mock("@/api", () => ({
  getSessionDeviceSync: vi.fn(),
  updateSessionDraft: vi.fn(),
}));

const getSessionDeviceSync = vi.mocked(api.getSessionDeviceSync);
const updateSessionDraft = vi.mocked(api.updateSessionDraft);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.clearAllMocks();
  updateSessionDraft.mockResolvedValue({ draft: null });
});

describe("SessionDeviceSync", () => {
  it("loads the server draft and stream after messages", async () => {
    getSessionDeviceSync.mockResolvedValue({
      draft: { text: "server draft", updatedAt: 1 },
      stream: { isStreaming: true, streamingReply: "partial" },
    });
    const sync = new SessionDeviceSync();

    await expect(sync.load("a")).resolves.toEqual({
      draft: { text: "server draft", updatedAt: 1 },
      stream: { isStreaming: true, streamingReply: "partial" },
    });
    expect(localStorage.getItem("wecode:session-draft:a")).toBe("server draft");
  });

  it("debounces draft writes and clears pending writes", async () => {
    const sync = new SessionDeviceSync();
    sync.scheduleDraftSave("a", "first");
    sync.scheduleDraftSave("a", "second");
    await vi.advanceTimersByTimeAsync(499);
    expect(updateSessionDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(updateSessionDraft).toHaveBeenCalledWith("a", "second");

    await sync.clearDraft("a");
    expect(updateSessionDraft).toHaveBeenLastCalledWith("a", "");
    expect(localStorage.getItem("wecode:session-draft:a")).toBeNull();
  });
});
