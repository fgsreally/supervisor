/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "*.css?url" {
  const url: string;
  export default url;
}

declare module "mammoth" {
  interface MammothResult {
    value: string;
    messages: unknown[];
  }
  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
  };
  export default mammoth;
}

declare module "pi-supervisor-native-bridge" {
  export type LiveStatusPhase = "connecting" | "thinking" | "tool" | "waiting" | "idle";

  export interface LiveStatusPayload {
    sessionId: string;
    title: string;
    subtitle?: string;
    phase?: LiveStatusPhase;
    chip?: string;
    activeCount?: number;
    completedCount?: number;
    totalCount?: number;
    allComplete?: boolean;
  }

  export interface SupervisorNativePlugin {
    getPushToken(): Promise<{ token: string | null; platform: "ios" | "android" | "web" }>;
    startBackgroundConnection(options: { title: string; body: string }): Promise<void>;
    stopBackgroundConnection(): Promise<void>;
    updateBackgroundConnection(options: { title: string; body: string }): Promise<void>;
    startLiveStatus(payload: LiveStatusPayload): Promise<void>;
    updateLiveStatus(payload: LiveStatusPayload): Promise<void>;
    endLiveStatus(options: { sessionId: string }): Promise<void>;
    isAndroidLiveUpdatesAvailable(): Promise<{
      available: boolean;
      promoted?: boolean;
      reason?: string;
    }>;
    isOppoLiveUpdatesAvailable(): Promise<{ available: boolean; reason?: string }>;
  }

  export const SupervisorNative: SupervisorNativePlugin;
}
