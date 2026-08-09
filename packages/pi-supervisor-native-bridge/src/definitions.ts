export type LiveStatusPhase = "connecting" | "thinking" | "tool" | "waiting" | "idle";

export interface LiveStatusPayload {
  sessionId: string;
  title: string;
  subtitle?: string;
  phase?: LiveStatusPhase;
}

export interface SupervisorNativePlugin {
  /** Register for remote push (token forwarded to Supervisor server by the app). */
  getPushToken(): Promise<{ token: string | null; platform: "ios" | "android" | "web" }>;

  /** Android foreground service + ongoing notification; iOS no-op. */
  startBackgroundConnection(options: { title: string; body: string }): Promise<void>;
  stopBackgroundConnection(): Promise<void>;
  updateBackgroundConnection(options: { title: string; body: string }): Promise<void>;

  /** Live status: Android 16 Live Updates; iOS Live Activity when available. */
  startLiveStatus(payload: LiveStatusPayload): Promise<void>;
  updateLiveStatus(payload: LiveStatusPayload): Promise<void>;
  endLiveStatus(options: { sessionId: string }): Promise<void>;

  /** Android 16+ AOSP Live Updates availability. */
  isAndroidLiveUpdatesAvailable(): Promise<{
    available: boolean;
    promoted?: boolean;
    reason?: string;
  }>;

  /** @deprecated Use isAndroidLiveUpdatesAvailable */
  isOppoLiveUpdatesAvailable(): Promise<{ available: boolean; reason?: string }>;
}
