import { describe, expect, it } from "vitest";
import { generateWebPin, isValidWebPin, resolveWebPin } from "../src/utils/web-password.js";

describe("web-password", () => {
  it("accepts exactly 4 digits", () => {
    expect(isValidWebPin("0000")).toBe(true);
    expect(isValidWebPin("4827")).toBe(true);
    expect(isValidWebPin("123")).toBe(false);
    expect(isValidWebPin("12345")).toBe(false);
    expect(isValidWebPin("12a4")).toBe(false);
    expect(isValidWebPin("")).toBe(false);
  });

  it("generates zero-padded 4-digit pins", () => {
    for (let i = 0; i < 40; i++) {
      const pin = generateWebPin();
      expect(pin).toMatch(/^\d{4}$/);
    }
  });

  it("auto-generates when password is omitted", () => {
    const result = resolveWebPin(undefined);
    expect(result.generated).toBe(true);
    expect(result.pin).toMatch(/^\d{4}$/);
  });

  it("keeps an explicit 4-digit password", () => {
    expect(resolveWebPin("0420")).toEqual({ pin: "0420", generated: false });
  });

  it("rejects non-digit or wrong-length passwords", () => {
    expect(() => resolveWebPin("secret")).toThrow(/exactly 4 digits/);
    expect(() => resolveWebPin("123")).toThrow(/exactly 4 digits/);
  });
});
