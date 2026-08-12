import { Capacitor } from "@capacitor/core";
import { SupervisorNative } from "pi-supervisor-native-bridge";

import { isNativeApp } from "./use-native-app";

type QrScanner = {
  scanQrCode: () => Promise<{ value: string }>;
};

export async function scanSupervisorQrCode(): Promise<string | null> {
  if (!isNativeApp()) return null;
  if (!Capacitor.isPluginAvailable("SupervisorNative")) return null;
  const scanner = SupervisorNative as unknown as QrScanner;
  if (typeof scanner.scanQrCode !== "function") return null;
  try {
    const result = await scanner.scanQrCode();
    const value = result?.value?.trim();
    return value || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel|cancelled|canceled/i.test(message)) return null;
    throw error instanceof Error ? error : new Error(message);
  }
}
