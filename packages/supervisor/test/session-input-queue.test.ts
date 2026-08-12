import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_INPUT_LEVEL,
  SessionInputQueue,
  SESSION_INPUT_INTERRUPT_LEVEL,
  shouldInterruptSessionInput,
} from "../src/core/session-input-queue.js";

describe("SessionInputQueue", () => {
  it("dequeues highest level first, then earliest enqueue time", () => {
    const queue = new SessionInputQueue();
    const base = Date.now();
    queue.enqueue(1, {
      id: "low",
      message: "low",
      level: 10,
      source: null,
      enqueuedAt: base + 2,
    });
    queue.enqueue(1, {
      id: "high",
      message: "high",
      level: 80,
      source: null,
      enqueuedAt: base + 1,
    });
    queue.enqueue(1, {
      id: "mid",
      message: "mid",
      level: 50,
      source: null,
      enqueuedAt: base,
    });

    expect(queue.dequeue(1)?.message).toBe("high");
    expect(queue.dequeue(1)?.message).toBe("mid");
    expect(queue.dequeue(1)?.message).toBe("low");
  });

  it("shouldInterruptSessionInput at interrupt threshold", () => {
    expect(shouldInterruptSessionInput(SESSION_INPUT_INTERRUPT_LEVEL - 1)).toBe(false);
    expect(shouldInterruptSessionInput(SESSION_INPUT_INTERRUPT_LEVEL)).toBe(true);
    expect(DEFAULT_SESSION_INPUT_LEVEL).toBeLessThan(SESSION_INPUT_INTERRUPT_LEVEL);
  });

  it("clears every pending input for a completed session", () => {
    const queue = new SessionInputQueue();
    queue.enqueue(7, {
      id: "first",
      message: "first",
      level: 50,
      source: null,
      enqueuedAt: 1,
    });
    queue.enqueue(7, {
      id: "second",
      message: "second",
      level: 40,
      source: null,
      enqueuedAt: 2,
    });

    expect(queue.clear(7).map((entry) => entry.id)).toEqual(["first", "second"]);
    expect(queue.list(7)).toEqual([]);
  });
});
