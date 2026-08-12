import { WebPlugin } from "@capacitor/core";

import type {
  LiveStatusPayload,
  PendingSharePayload,
  SupervisorNativePlugin,
} from "./definitions.js";

export class SupervisorNativeWeb extends WebPlugin implements SupervisorNativePlugin {
  async getPushToken(): Promise<{ token: string | null; platform: "ios" | "android" | "web" }> {
    return { token: null, platform: "web" };
  }

  async getPendingShare(): Promise<PendingSharePayload | null> {
    return null;
  }

  async clearPendingShare(): Promise<void> {}

  async startBackgroundConnection(_options: { title: string; body: string }): Promise<void> {
    // Web/PWA has no foreground service.
  }

  async stopBackgroundConnection(): Promise<void> {}

  async updateBackgroundConnection(_options: { title: string; body: string }): Promise<void> {}

  async startLiveStatus(_payload: LiveStatusPayload): Promise<void> {}

  async updateLiveStatus(_payload: LiveStatusPayload): Promise<void> {}

  async endLiveStatus(_options: { sessionId: string }): Promise<void> {}

  async isAndroidLiveUpdatesAvailable(): Promise<{
    available: boolean;
    promoted?: boolean;
    reason?: string;
  }> {
    return { available: false, reason: "web" };
  }

  async isOppoLiveUpdatesAvailable(): Promise<{ available: boolean; reason?: string }> {
    return this.isAndroidLiveUpdatesAvailable();
  }

  async scanQrCode(): Promise<{ value: string }> {
    throw this.unimplemented("scanQrCode is only available on native platforms.");
  }
}
