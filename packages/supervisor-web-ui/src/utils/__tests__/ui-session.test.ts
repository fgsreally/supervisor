import { describe, expect, it } from "vitest";
import type { UISession } from "@/types/ui";
import { compareSessionsByRecentActivity, sessionRecentActivity } from "../ui-session";

function session(id: string, lastActiveAt: string, parentId?: string): UISession {
  return {
    id,
    workspaceId: "p1",
    parentId,
    creationMethod: "user",
    showInSessionList: true,
    status: "idle",
    lastActiveAt,
    title: id,
    meta: {},
    lastMessagePreview: "",
  };
}

describe("sessionRecentActivity", () => {
  it("uses the latest descendant activity for root ordering", () => {
    const all = [
      session("root-a", "2026-01-01T00:00:00.000Z"),
      session("root-b", "2026-01-01T00:00:00.000Z"),
      session("child-b", "2026-01-02T00:00:00.000Z", "root-b"),
    ];
    expect(sessionRecentActivity(all[0]!, all)).toBeLessThan(sessionRecentActivity(all[1]!, all));
    expect(compareSessionsByRecentActivity(all[0]!, all[1]!, all)).toBeGreaterThan(0);
  });
});
