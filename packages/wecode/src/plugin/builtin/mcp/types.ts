import { Type, type Static } from "typebox";

// ============================================================================
// MCP server config (mcp.json) schema
// ============================================================================

export const McpStdioServerConfig = Type.Object({
  type: Type.Literal("stdio"),
  command: Type.String({ minLength: 1 }),
  args: Type.Optional(Type.Array(Type.String())),
  /** Env vars, supports `${env:VAR_NAME}` placeholders resolved at load time. */
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  /** Connection timeout in ms. Default 15000. */
  timeoutMs: Type.Optional(Type.Number({ default: 15000 })),
  /** Skip this server if true. */
  disabled: Type.Optional(Type.Boolean({ default: false })),
});

export const McpSseServerConfig = Type.Object({
  type: Type.Literal("sse"),
  url: Type.String({ minLength: 1 }),
  /** Optional HTTP headers sent during connection. Supports `${env:VAR_NAME}`. */
  headers: Type.Optional(Type.Record(Type.String(), Type.String())),
  timeoutMs: Type.Optional(Type.Number({ default: 15000 })),
  disabled: Type.Optional(Type.Boolean({ default: false })),
});

export const McpServerConfig = Type.Union([McpStdioServerConfig, McpSseServerConfig]);

export const McpConfigSchema = Type.Object({
  servers: Type.Record(Type.String({ minLength: 1 }), McpServerConfig),
  /** Session-level default options. */
  sessionDefaults: Type.Optional(
    Type.Object({
      timeoutMs: Type.Optional(Type.Number({ default: 15000 })),
    }),
  ),
});

// ============================================================================
// Runtime types
// ============================================================================

export type McpServerConfigType = Static<typeof McpServerConfig>;

export interface McpConfig {
  servers: Record<string, McpServerConfigType>;
  sessionDefaults?: { timeoutMs?: number };
}

export interface McpServerStatus {
  name: string;
  type: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  connected: boolean;
  error?: string;
  toolCount: number;
}
