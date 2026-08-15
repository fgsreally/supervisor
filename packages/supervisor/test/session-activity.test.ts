import { describe, expect, it, vi } from "vitest";
import {
  SESSION_ACTIVITY_IDLE_MS,
  runSessionActivityTick,
  touchSessionActivity,
} from "../src/core/session-activity.js";

function fakeDb(status: string, lastActiveAt: number) {
  const row = { id: 1, status, last_active_at: lastActiveAt } as any;
  return {
    get: vi.fn(() => row),
    updateStatus: vi.fn((_: number, next: string) => {
      row.status = next;
      row.last_active_at = Date.now();
    }),
    touchSessionActivityTree: vi.fn(),
    db: { prepare: vi.fn() },
  } as any;
}

describe("session activity policy", () => {
  it("uses a 24 hour default window", () => {
    expect(SESSION_ACTIVITY_IDLE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("marks an idle session active when touched", () => {
    const db = fakeDb("idle", 1);
    touchSessionActivity(db, 1, 100);
    expect(db.updateStatus).toHaveBeenCalledWith(1, "active");
  });

  it("does not replace a running session", () => {
    const db = fakeDb("running", 1);
    touchSessionActivity(db, 1, 100);
    expect(db.updateStatus).not.toHaveBeenCalled();
    expect(db.touchSessionActivityTree).toHaveBeenCalledWith(1, 100);
  });

  it("transitions only expired active sessions", () => {
    const run = vi.fn(() => ({ changes: 2 }));
    const db = { db: { prepare: vi.fn(() => ({ run })) } } as any;
    expect(runSessionActivityTick(db, 1000, 100)).toBe(2);
    expect(run).toHaveBeenCalledWith(900);
  });
});
