import { describe, expect, it } from "vitest";
import { generateWebPin, isValidWebPin, resolveWebPin } from "../src/utils/web-password.js";

describe("web-password", () => {
  it("accepts exactly 6 digits", () => {
    expect(isValidWebPin("000000")).toBe(true);
    expect(isValidWebPin("482715")).toBe(true);
    expect(isValidWebPin("123")).toBe(false);
    expect(isValidWebPin("12345")).toBe(false);
    expect(isValidWebPin("12a4")).toBe(false);
    expect(isValidWebPin("")).toBe(false);
  });

  it("generates zero-padded 6-digit pins", () => {
    for (let i = 0; i < 40; i++) {
      const pin = generateWebPin();
      expect(pin).toMatch(/^\d{6}$/);
    }
  });

  it("auto-generates when password is omitted", () => {
    const result = resolveWebPin(undefined);
    expect(result.generated).toBe(true);
    expect(result.pin).toMatch(/^\d{6}$/);
  });

  it("keeps an explicit 6-digit password", () => {
    expect(resolveWebPin("042015")).toEqual({ pin: "042015", generated: false });
  });

  it("rejects non-digit or wrong-length passwords", () => {
    expect(() => resolveWebPin("secret")).toThrow(/exactly 6 digits/);
    expect(() => resolveWebPin("123")).toThrow(/exactly 6 digits/);
  });
});
