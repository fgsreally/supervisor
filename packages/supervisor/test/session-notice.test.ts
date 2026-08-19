import { describe, expect, it } from "vitest";
import { appendShadowMessage, SHADOW_MESSAGE_TYPE } from "../src/core/session-notice.js";

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
});
