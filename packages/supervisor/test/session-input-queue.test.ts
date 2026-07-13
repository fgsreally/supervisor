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
			message: "low",
			level: 10,
			source: null,
			enqueuedAt: base + 2,
		});
		queue.enqueue(1, {
			message: "high",
			level: 80,
			source: null,
			enqueuedAt: base + 1,
		});
		queue.enqueue(1, {
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
});
