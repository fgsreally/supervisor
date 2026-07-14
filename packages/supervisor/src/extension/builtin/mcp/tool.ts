import { Type, type TSchema } from "typebox";
import type { ToolDefinition } from "../../types.js";

/**
 * Lightweight JSON Schema to TypeBox TSchema converter.
 * Covers ~90% of real MCP tool input schemas (object, string, number, integer,
 * boolean, array). Falls back to Type.Unknown() for complex schemas.
 */
function jsonSchemaToTypeBox(schema: Record<string, unknown> | undefined | null): TSchema {
  if (!schema || typeof schema !== "object") return Type.Object({});

  const type = schema.type;

  switch (type) {
    case "string": {
      const enumValues = schema.enum;
      if (Array.isArray(enumValues) && enumValues.length > 0) {
        return Type.Union(enumValues.map((v: string) => Type.Literal(v))) as unknown as TSchema;
      }
      return Type.String();
    }
    case "number":
      return Type.Number();
    case "integer":
      return Type.Integer();
    case "boolean":
      return Type.Boolean();
    case "array": {
      const items = schema.items
        ? jsonSchemaToTypeBox(schema.items as Record<string, unknown>)
        : Type.Unknown();
      return Type.Array(items);
    }
    case "object": {
      const props: Record<string, TSchema> = {};
      const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
      const requiredSet = new Set<string>(
        Array.isArray(schema.required) ? (schema.required as string[]) : [],
      );

      for (const [key, val] of Object.entries(properties)) {
        if (val && typeof val === "object") {
          const t = jsonSchemaToTypeBox(val);
          props[key] = requiredSet.has(key) ? t : Type.Optional(t);
        }
      }

      return Type.Object(props, {
        additionalProperties: schema.additionalProperties !== false ? Type.Unknown() : false,
      });
    }
    default:
      return Type.Unknown();
  }
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

/**
 * Wrap an MCP tool definition into an extension tool.
 * Tool calls are forwarded to the MCP server via the provided callTool function.
 */
export function mcpToolToExtensionTool(
  serverName: string,
  mcpTool: McpToolDefinition,
  callTool: (toolName: string, params: unknown) => Promise<unknown>,
): ToolDefinition<TSchema, unknown> {
  const toolName = `${serverName}__${mcpTool.name}`;

  return {
    name: toolName,
    description: `${mcpTool.description ?? ""} (via MCP: ${serverName})`,
    parameters: jsonSchemaToTypeBox(mcpTool.inputSchema as Record<string, unknown> | undefined),
    async execute(params) {
      try {
        const result = (await callTool(mcpTool.name, params)) as {
          content?: Array<{ type: string; text?: string }>;
          isError?: boolean;
        };
        const content = result?.content;
        if (Array.isArray(content)) {
          return {
            content: content.map((c) => ({
              type: "text" as const,
              text: typeof c.text === "string" ? c.text : JSON.stringify(c),
            })),
            details: result,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          details: result,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `MCP tool ${toolName} failed: ${message}` }],
          details: { error: message },
          isError: true,
        };
      }
    },
  };
}
