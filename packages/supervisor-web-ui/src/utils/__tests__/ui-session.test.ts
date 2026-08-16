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
    createdAt: lastActiveAt,
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

  it("orders by last message time, not lastActiveAt bumps", () => {
    const older = {
      ...session("older", "2026-08-16T13:18:00.000Z"),
      createdAt: "2026-01-01T00:00:00.000Z",
      lastMessageAt: "2026-01-02T00:00:00.000Z",
    };
    const created = session("created", "2026-08-16T13:18:00.000Z");
    expect(compareSessionsByRecentActivity(older, created, [older, created])).toBeGreaterThan(0);
  });
});
