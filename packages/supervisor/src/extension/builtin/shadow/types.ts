export interface ShadowProtocolResult {
  shadowMemory?: {
    action: "append" | "replace";
    content: string;
  };
  alert?: string;
  analysis?: string;
  suggestedQuestions?: string[];
  status?: string;
  title?: string;
  commitMessage?: string;
}
