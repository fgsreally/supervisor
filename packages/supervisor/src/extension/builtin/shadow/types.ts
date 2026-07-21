export interface ShadowProtocolResult {
  shadowMemory?: {
    action: "append" | "replace";
    content: string;
  };
  message?: string;
  interrupt?: boolean;
  suggestedQuestions?: string[];
  status?: string;
  title?: string;
  commitMessage?: string;
}
