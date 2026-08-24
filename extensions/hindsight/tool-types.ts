import type { TSchema } from "pi-supervisor";
import type { ToolDefinition } from "pi-supervisor";

export type HindsightTool<TParams extends TSchema, TResult> = ToolDefinition<TParams, TResult>;
