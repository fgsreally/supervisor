import type { Api } from "@earendil-works/pi-ai";

/**
 * The wire protocol a provider speaks. This deliberately contains no vendor
 * name: credentials and endpoint ownership belong to the provider record.
 */
export type ApiProtocol = "messages" | "chat-completions" | "responses";

const LEGACY_PROTOCOLS: Record<string, ApiProtocol> = {
  "anthropic-messages": "messages",
  "openai-compatible": "chat-completions",
  "openai-completions": "chat-completions",
  "openai-responses": "responses",
};

export function normalizeApiProtocol(value: string): ApiProtocol | undefined {
  if (value === "messages" || value === "chat-completions" || value === "responses") {
    return value;
  }
  return LEGACY_PROTOCOLS[value];
}

/** Resolve request/DB input to a canonical protocol value for persistence. */
export function requireApiProtocol(value: string): ApiProtocol {
  const protocol = normalizeApiProtocol(value);
  if (!protocol) {
    throw new Error(`Unknown wire protocol: ${value}`);
  }
  return protocol;
}

/** Translate Supervisor's vendor-neutral protocol name to pi-ai's internal API key. */
export function toPiApi(protocol: ApiProtocol): Api {
  switch (protocol) {
    case "messages":
      return "anthropic-messages";
    case "chat-completions":
      return "openai-completions";
    case "responses":
      return "openai-responses";
  }
}
