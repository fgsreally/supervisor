import { describe, expect, it, vi } from "vitest";
import {
  SESSION_SERVICE_SLEEP_MS,
  computeServiceSleepAt,
  runSessionServiceSleepTick,
} from "../src/core/session/session-service-sleep.js";

describe("session project service sleep", () => {
  it("uses a 24 hour idle window", () => {
    expect(SESSION_SERVICE_SLEEP_MS).toBe(24 * 60 * 60 * 1000);
    expect(computeServiceSleepAt(1_000)).toBe(1_000 + 24 * 60 * 60 * 1000);
  });

  it("moves expired active services to idle and publishes the update", async () => {
    const updateMeta = vi.fn();
    const updateSessionFields = vi.fn();
    const onUpdated = vi.fn();
    const services = {
      startCommand: "server --port ${PORT}",
      services: [{ name: "web", port: 43219, path: "/" }],
      sleepAt: Date.now() - 1,
      pid: null,
      jobId: "job-1",
    };
    const db = {
      list: () => [{ id: 7, cwd: process.cwd(), meta: JSON.stringify({ services }) }],
      get: () => ({ system_prompt: "base prompt" }),
      updateMeta,
      updateSessionFields,
    };

    await runSessionServiceSleepTick({ db: db as never, onUpdated });

    expect(updateMeta).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        services: expect.objectContaining({ jobId: undefined, pid: null }),
      }),
    );
    expect(onUpdated).toHaveBeenCalledWith(7);
    expect(updateSessionFields).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        systemPrompt: expect.stringContaining("Local services registered"),
      }),
    );
  });
});
