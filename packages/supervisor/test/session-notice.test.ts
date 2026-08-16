import { describe, expect, it } from "vitest";
import { appendCustomMessage, SHADOW_ANALYSIS_MESSAGE_TYPE } from "../src/core/session-notice.js";

describe("session custom notices", () => {
  it("stores Shadow analysis as a type=custom entry", async () => {
    const entries: unknown[] = [];
    const storage = {
      createEntryId: async () => "entry-1",
      getLeafId: async () => "leaf-1",
      appendEntry: async (entry: unknown) => {
        entries.push(entry);
      },
    };

    await appendCustomMessage(storage, "analysis", SHADOW_ANALYSIS_MESSAGE_TYPE);

    expect(entries[0]).toMatchObject({
      type: "custom",
      customType: "shadow_analysis",
      data: { text: "analysis" },
    });
  });
});
