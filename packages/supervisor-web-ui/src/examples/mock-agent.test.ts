import { afterEach, describe, expect, it, vi } from "vitest";
import { streamExampleReply, type DemoEvent } from "./mock-agent";

describe("example mock agent", () => {
  afterEach(() => vi.useRealTimers());

  it("streams assistant chunks and shadow warning events without an API call", () => {
    vi.useFakeTimers();
    const events: DemoEvent[] = [];
    const done = vi.fn();
    streamExampleReply("example:shadow:interaction", "2", 0, (event) => events.push(event), done);

    vi.advanceTimersByTime(3000);

    expect(events.some((event) => event.type === "message_update")).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "shadow_running", running: true }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: "shadow_message", level: "warning" }),
    );
    expect(done).toHaveBeenCalledOnce();
  });
});
