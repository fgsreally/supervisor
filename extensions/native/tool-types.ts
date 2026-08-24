import type { TSchema } from "typebox";

export type NativeToolResult = {
  content: Array<{
    type: string;
    text?: string;
    url?: string;
    data?: string;
    mimeType?: string;
  }>;
  details?: unknown;
  isError?: boolean;
};

/** Internal tool shape; register-tool adapts it to supervisor's ToolDefinition API. */
export type NativeTool = {
  name: string;
  label: string;
  description: string;
  parameters: TSchema;
  execute: (...args: any[]) => Promise<NativeToolResult>;
};
