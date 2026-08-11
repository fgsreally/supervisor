export type LiveStatusPhase = "connecting" | "thinking" | "tool" | "waiting" | "idle";

export interface LiveStatusPayload {
  sessionId: string;
  title: string;
  subtitle?: string;
  phase?: LiveStatusPhase;
  /** Status-bar chip override (e.g. "1/2" or "完成"; keep ≤7 chars). */
  chip?: string;
  /** Currently executing session count. */
  activeCount?: number;
  /** Completed session count in the current activity wave. */
  completedCount?: number;
  /** active + completed in the current activity wave. */
  totalCount?: number;
  /** True when every tracked session in this wave has finished. */
  allComplete?: boolean;
}

export interface ShareItem {
  uri: string;
  mimeType: string;
  name: string;
}

export interface PendingSharePayload {
  items: ShareItem[];
}

export interface SupervisorNativePlugin {
  /** Register for remote push (token forwarded to Supervisor server by the app). */
  getPushToken(): Promise<{ token: string | null; platform: "ios" | "android" | "web" }>;

  /** Android share target: images received via ACTION_SEND before web-ui consumes them. */
  getPendingShare(): Promise<PendingSharePayload | null>;
  clearPendingShare(): Promise<void>;
  addListener(
    eventName: "shareReceived",
    listenerFunc: (payload: PendingSharePayload) => void,
  ): Promise<{ remove: () => void }>;

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
