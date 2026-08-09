import type { LiveStatusPayload, LiveStatusPhase } from "pi-supervisor-native-bridge";

import { isNativeApp } from "./use-native-app";

let supervisorNative: typeof import("pi-supervisor-native-bridge").SupervisorNative | null = null;

async function plugin() {
  if (!isNativeApp()) return null;
  if (!supervisorNative) {
    const mod = await import("pi-supervisor-native-bridge");
    supervisorNative = mod.SupervisorNative;
  }
  return supervisorNative;
}

export async function startLiveStatus(payload: LiveStatusPayload): Promise<void> {
  const native = await plugin();
  if (!native) return;
  await native.startLiveStatus(payload);
}

export async function updateLiveStatus(payload: LiveStatusPayload): Promise<void> {
  const native = await plugin();
  if (!native) return;
  await native.updateLiveStatus(payload);
}

export async function endLiveStatus(sessionId: string): Promise<void> {
  const native = await plugin();
  if (!native) return;
  await native.endLiveStatus({ sessionId });
}

export async function syncAgentLiveStatus(options: {
  sessionId: string;
  title: string;
  subtitle: string;
  phase: LiveStatusPhase;
  running: boolean;
}): Promise<void> {
  const payload: LiveStatusPayload = {
    sessionId: options.sessionId,
    title: options.title,
    subtitle: options.subtitle,
    phase: options.phase,
  };
  if (!options.running) {
    await endLiveStatus(options.sessionId);
    return;
  }
  await updateLiveStatus(payload);
}

export async function isAndroidLiveUpdatesAvailable(): Promise<boolean> {
  const native = await plugin();
  if (!native) return false;
  const result = await native.isAndroidLiveUpdatesAvailable();
  return result.available;
}

/** @deprecated Use isAndroidLiveUpdatesAvailable */
export async function isOppoLiveUpdatesAvailable(): Promise<boolean> {
  return isAndroidLiveUpdatesAvailable();
}

export async function startBackgroundConnection(title: string, body: string): Promise<void> {
  const native = await plugin();
  if (!native) return;
  await native.startBackgroundConnection({ title, body });
}

export async function stopBackgroundConnection(): Promise<void> {
  const native = await plugin();
  if (!native) return;
  await native.stopBackgroundConnection();
}

export async function updateBackgroundConnection(title: string, body: string): Promise<void> {
  const native = await plugin();
  if (!native) return;
  await native.updateBackgroundConnection({ title, body });
}

export type { LiveStatusPhase, LiveStatusPayload };
