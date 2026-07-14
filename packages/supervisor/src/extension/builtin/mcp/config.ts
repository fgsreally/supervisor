import { existsSync, readFileSync } from "node:fs";
import type { McpConfig, McpServerConfigType } from "./types.js";

/** Resolve `${env:VAR_NAME}` placeholders in a string value. */
function resolveEnvVars(value: string): string {
  return value.replace(/\$\{env:([^}]+)\}/g, (_match, varName: string) => {
    return process.env[varName] ?? "";
  });
}

/** Recursively resolve env vars in a config object. */
function resolveEnvVarsInConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string") {
      result[key] = resolveEnvVars(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = resolveEnvVarsInConfig(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** 从指定 JSON 文件读取 MCP 配置；文件不存在或内容无效时返回 null。 */
export function loadMcpConfigFile(configPath: string): McpConfig | null {
  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as McpConfig;
    if (!parsed.servers || typeof parsed.servers !== "object") return null;

    const resolved: McpConfig = { servers: {} };
    for (const [name, serverConfig] of Object.entries(parsed.servers)) {
      if (!serverConfig || typeof serverConfig !== "object") continue;
      const resolvedConfig = resolveEnvVarsInConfig(
        serverConfig as Record<string, unknown>,
      ) as unknown as McpServerConfigType;
      resolved.servers[name] = resolvedConfig;
    }

    if (parsed.sessionDefaults) {
      resolved.sessionDefaults = parsed.sessionDefaults;
    }

    return resolved;
  } catch {
    return null;
  }
}
