const SERVER_URL_KEY = "supervisor.serverUrl";
const SERVER_PIN_KEY = "supervisor.serverPin";
const DEVICE_ID_KEY = "supervisor.deviceId";
const BACKGROUND_CONNECTION_KEY = "supervisor.backgroundConnection";

export function getMobileServerUrl(): string | null {
  const value = localStorage.getItem(SERVER_URL_KEY)?.trim();
  return value || null;
}

export function setMobileServerUrl(url: string): void {
  localStorage.setItem(SERVER_URL_KEY, url.trim().replace(/\/+$/, ""));
}

export function getMobileServerPin(): string | null {
  const value = localStorage.getItem(SERVER_PIN_KEY)?.trim();
  return value || null;
}

export function setMobileServerPin(pin: string): void {
  localStorage.setItem(SERVER_PIN_KEY, pin.trim());
}

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY)?.trim();
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function isBackgroundConnectionEnabled(): boolean {
  return localStorage.getItem(BACKGROUND_CONNECTION_KEY) === "1";
}

export function setBackgroundConnectionEnabled(enabled: boolean): void {
  localStorage.setItem(BACKGROUND_CONNECTION_KEY, enabled ? "1" : "0");
}

/** Apply stored server URL to API base when running inside the native shell. */
export function resolveNativeApiBase(defaultBase: string): string {
  const stored = getMobileServerUrl();
  if (!stored) return defaultBase;
  return stored;
}
