import { randomInt } from "node:crypto";

/** Web UI access PIN: exactly 4 digits. */
export const WEB_PIN_LENGTH = 4;
export const WEB_PIN_PATTERN = /^\d{4}$/;

export function isValidWebPin(value: string | undefined | null): value is string {
  return typeof value === "string" && WEB_PIN_PATTERN.test(value);
}

/** Cryptographically random 4-digit PIN, zero-padded (`0000`–`9999`). */
export function generateWebPin(): string {
  return String(randomInt(0, 10_000)).padStart(WEB_PIN_LENGTH, "0");
}

/**
 * Resolve the serve-time web PIN.
 * - omitted → generate a random 4-digit PIN
 * - provided → must be exactly 4 digits, else throw
 */
export function resolveWebPin(raw: string | undefined): { pin: string; generated: boolean } {
  if (raw === undefined) {
    return { pin: generateWebPin(), generated: true };
  }
  const pin = raw.trim();
  if (!isValidWebPin(pin)) {
    throw new Error(
      `Invalid --password "${raw}". Web access PIN must be exactly ${WEB_PIN_LENGTH} digits (e.g. 4827).`,
    );
  }
  return { pin, generated: false };
}
