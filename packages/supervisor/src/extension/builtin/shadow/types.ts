export type ShadowMessageLevel = "error" | "warning" | "info";

export interface ShadowProtocolResult {
  shadowMemory?: {
    action: "append" | "replace";
    content: string;
  };
  message?: string;
  level?: ShadowMessageLevel;
  suggestedQuestions?: string[];
  title?: string;
  extensions?: Record<string, unknown>;
}
