export const SHADOW_URGENCIES = ["low", "normal", "high", "critical"] as const;

export type ShadowUrgency = (typeof SHADOW_URGENCIES)[number];

export interface ShadowProtocolResult {
  shadowMemory?: {
    action: "append" | "replace";
    content: string;
  };
  message?: string;
  urgency?: ShadowUrgency;
  suggestion?: string;
  title?: string;
}
