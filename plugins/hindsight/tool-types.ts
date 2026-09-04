import type { TSchema } from "wecode";
import type { ToolDefinition } from "wecode";

export type HindsightTool<TParams extends TSchema, TResult> = ToolDefinition<TParams, TResult>;
