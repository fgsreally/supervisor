import { describe, expect, it } from "vitest";
import {
  appendShadowMessage,
  appendShadowRunPlaceholder,
  SHADOW_MESSAGE_TYPE,
  SHADOW_RUN_MESSAGE_TYPE,
} from "../src/core/session/session-notice.js";

describe("session custom notices", () => {
  it("stores leveled Shadow messages as type=custom entries", async () => {
    const entries: unknown[] = [];
    const storage = {
      createEntryId: async () => "entry-1",
      getLeafId: async () => "leaf-1",
      appendEntry: async (entry: unknown) => {
        entries.push(entry);
      },
    };

    await appendShadowMessage(storage, "analysis", "warning");

    expect(entries[0]).toMatchObject({
      type: "custom",
      customType: SHADOW_MESSAGE_TYPE,
      data: { text: "analysis", level: "warning" },
    });
  });

  it("stores a visible Shadow placeholder with its start timestamp", async () => {
    const entries: unknown[] = [];
    const storage = {
      createEntryId: async () => "shadow-run-1",
      getLeafId: async () => "leaf-1",
      appendEntry: async (entry: unknown) => {
        entries.push(entry);
      },
    };

    await appendShadowRunPlaceholder(storage, 1_700_000_000_000);

    expect(entries[0]).toMatchObject({
      id: "shadow-run-1",
      parentId: "leaf-1",
      timestamp: new Date(1_700_000_000_000).toISOString(),
      type: "custom",
      customType: SHADOW_RUN_MESSAGE_TYPE,
      data: { status: "running", text: "", level: "info", startedAt: 1_700_000_000_000 },
    });
  });
});
