const SERVER_URL_KEY = "supervisor.serverUrl";
const SERVER_PIN_KEY = "supervisor.serverPin";
const DEVICE_ID_KEY = "supervisor.deviceId";
const BACKGROUND_CONNECTION_KEY = "supervisor.backgroundConnection";
const INSTANCES_KEY = "supervisor.instances";
const ACTIVE_INSTANCE_KEY = "supervisor.activeInstanceId";

export interface SupervisorInstance {
  id: string;
  /** Display name; defaults to host when empty. */
  name: string;
  url: string;
  pin: string;
  lastUsedAt: number;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `inst-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function displayNameForUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.port) return `${parsed.hostname}:${parsed.port}`;
    return parsed.hostname || url;
  } catch {
    return url;
  }
}

function migrateLegacyInstance(): void {
  if (localStorage.getItem(INSTANCES_KEY)) return;
  const url = localStorage.getItem(SERVER_URL_KEY)?.trim();
  const pin = localStorage.getItem(SERVER_PIN_KEY)?.trim() ?? "";
  if (!url) return;
  const instance: SupervisorInstance = {
    id: createId(),
    name: displayNameForUrl(normalizeUrl(url)),
    url: normalizeUrl(url),
    pin,
    lastUsedAt: Date.now(),
  };
  localStorage.setItem(INSTANCES_KEY, JSON.stringify([instance]));
  localStorage.setItem(ACTIVE_INSTANCE_KEY, instance.id);
}

export function listSupervisorInstances(): SupervisorInstance[] {
  migrateLegacyInstance();
  try {
    const raw = localStorage.getItem(INSTANCES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SupervisorInstance[];
    if (!Array.isArray(parsed)) return [];
    return [...parsed].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
  } catch {
    return [];
  }
}

function writeInstances(instances: SupervisorInstance[]): void {
  localStorage.setItem(INSTANCES_KEY, JSON.stringify(instances));
}

export function getActiveInstanceId(): string | null {
  migrateLegacyInstance();
  return localStorage.getItem(ACTIVE_INSTANCE_KEY)?.trim() || null;
}

export function getActiveSupervisorInstance(): SupervisorInstance | null {
  const id = getActiveInstanceId();
  if (!id) return null;
  return listSupervisorInstances().find((item) => item.id === id) ?? null;
}

/** Sync legacy single-key fields used by api.ts / bootstrap. */
function syncActiveKeys(instance: SupervisorInstance | null): void {
  if (!instance) {
    localStorage.removeItem(SERVER_URL_KEY);
    localStorage.removeItem(SERVER_PIN_KEY);
    localStorage.removeItem(ACTIVE_INSTANCE_KEY);
    return;
  }
  localStorage.setItem(SERVER_URL_KEY, instance.url);
  localStorage.setItem(SERVER_PIN_KEY, instance.pin);
  localStorage.setItem(ACTIVE_INSTANCE_KEY, instance.id);
}

export function setActiveSupervisorInstance(id: string): SupervisorInstance | null {
  const instances = listSupervisorInstances();
  const index = instances.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const updated: SupervisorInstance = { ...instances[index]!, lastUsedAt: Date.now() };
  instances[index] = updated;
  writeInstances(instances);
  syncActiveKeys(updated);
  return updated;
}

export function upsertSupervisorInstance(input: {
  id?: string;
  name?: string;
  url: string;
  pin: string;
  activate?: boolean;
}): SupervisorInstance {
  const url = normalizeUrl(input.url);
  const pin = input.pin.trim();
  const name = (input.name?.trim() || displayNameForUrl(url)).trim();
  const instances = listSupervisorInstances();
  const existingIndex = input.id
    ? instances.findIndex((item) => item.id === input.id)
    : instances.findIndex((item) => normalizeUrl(item.url) === url);

  let instance: SupervisorInstance;
  if (existingIndex >= 0) {
    const prev = instances[existingIndex]!;
    instance = {
      ...prev,
      name,
      url,
      pin,
      lastUsedAt: Date.now(),
    };
    instances[existingIndex] = instance;
  } else {
    instance = {
      id: input.id ?? createId(),
      name,
      url,
      pin,
      lastUsedAt: Date.now(),
    };
    instances.unshift(instance);
  }
  writeInstances(instances);
  if (input.activate !== false) syncActiveKeys(instance);
  return instance;
}

export function removeSupervisorInstance(id: string): void {
  const next = listSupervisorInstances().filter((item) => item.id !== id);
  writeInstances(next);
  const activeId = getActiveInstanceId();
  if (activeId === id) {
    const fallback = next[0] ?? null;
    syncActiveKeys(fallback);
  }
}

export function clearActiveSupervisorInstance(): void {
  localStorage.removeItem(ACTIVE_INSTANCE_KEY);
  localStorage.removeItem(SERVER_URL_KEY);
  localStorage.removeItem(SERVER_PIN_KEY);
}

export function hasConfiguredSupervisorInstance(): boolean {
  const active = getActiveSupervisorInstance();
  return Boolean(active?.url && active.pin);
}

export function getMobileServerUrl(): string | null {
  migrateLegacyInstance();
  const active = getActiveSupervisorInstance();
  if (active?.url) return active.url;
  const value = localStorage.getItem(SERVER_URL_KEY)?.trim();
  return value || null;
}

export function setMobileServerUrl(url: string): void {
  const normalized = normalizeUrl(url);
  localStorage.setItem(SERVER_URL_KEY, normalized);
  const active = getActiveSupervisorInstance();
  if (active) {
    upsertSupervisorInstance({
      id: active.id,
      name: active.name,
      url: normalized,
      pin: active.pin || getMobileServerPin() || "",
      activate: true,
    });
  }
}

export function getMobileServerPin(): string | null {
  migrateLegacyInstance();
  const active = getActiveSupervisorInstance();
  if (active?.pin) return active.pin;
  const value = localStorage.getItem(SERVER_PIN_KEY)?.trim();
  return value || null;
}

export function setMobileServerPin(pin: string): void {
  const value = pin.trim();
  localStorage.setItem(SERVER_PIN_KEY, value);
  const active = getActiveSupervisorInstance();
  if (active) {
    upsertSupervisorInstance({
      id: active.id,
      name: active.name,
      url: active.url,
      pin: value,
      activate: true,
    });
  }
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

export function parseSupervisorQrPayload(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return normalizeUrl(value);
  } catch {
    return null;
  }
}
