import type { WireProtocol } from "@/api";
import type { UIProviderModel } from "@/types/ui";

export const WIRE_PROTOCOLS: Array<{ value: WireProtocol; label: string }> = [
  { value: "messages", label: "Messages" },
  { value: "chat-completions", label: "Chat Completions" },
  { value: "responses", label: "Responses" },
];

export interface ProviderPreset {
  id: string;
  name: string;
  nameKey?: string;
  icon: string;
  protocol: WireProtocol;
  baseUrl: string | null;
  authType?: "api-key" | "oauth";
  color: string;
  models: UIProviderModel[];
}

function presetModels(...ids: string[]): UIProviderModel[] {
  return ids.map((id) => createEmptyProviderModel(id));
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "custom",
    name: "Custom",
    nameKey: "provider.preset.custom",
    icon: "lucide:sparkles",
    protocol: "chat-completions",
    baseUrl: null,
    color: "#57606a",
    models: [],
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: "/icons/openai.svg",
    protocol: "responses",
    baseUrl: null,
    color: "#10a37f",
    models: presetModels("gpt-4o", "gpt-4o-mini", "o3", "o4-mini"),
  },
  {
    id: "openai-codex",
    name: "ChatGPT (Codex 订阅)",
    icon: "/icons/openai.svg",
    protocol: "responses",
    baseUrl: null,
    authType: "oauth",
    color: "#10a37f",
    models: presetModels("gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.1-codex-mini"),
  },
  {
    id: "gemini",
    name: "Gemini",
    icon: "/icons/gemini.svg",
    protocol: "chat-completions",
    baseUrl: null,
    color: "#4285f4",
    models: presetModels("gemini-2.5-pro", "gemini-2.5-flash"),
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    icon: "/icons/anthropic.svg",
    protocol: "messages",
    baseUrl: null,
    color: "#d97757",
    models: presetModels("claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"),
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "/icons/deepseek.svg",
    protocol: "chat-completions",
    baseUrl: "https://api.deepseek.com",
    color: "#4d6bfe",
    models: presetModels("deepseek-chat", "deepseek-reasoner"),
  },
  {
    id: "minimax",
    name: "MiniMax",
    icon: "/icons/minimax.svg",
    protocol: "messages",
    baseUrl: "https://api.minimax.io/anthropic",
    color: "#f04438",
    models: presetModels("MiniMax-M2.7", "MiniMax-M2.5"),
  },
  {
    id: "minimax-cn",
    name: "MiniMax (China)",
    nameKey: "provider.preset.minimaxChina",
    icon: "/icons/minimax.svg",
    protocol: "messages",
    baseUrl: "https://api.minimaxi.com/anthropic",
    color: "#f04438",
    models: presetModels("MiniMax-M2.7", "MiniMax-M2.5"),
  },
  {
    id: "doubao",
    name: "Doubao (ByteDance)",
    nameKey: "provider.preset.doubao",
    icon: "/icons/doubao.svg",
    protocol: "messages",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
    color: "#325dff",
    models: presetModels("doubao-pro-32k", "doubao-lite-32k", "doubao-pro-128k"),
  },
  {
    id: "groq",
    name: "Groq",
    icon: "/icons/groq.svg",
    protocol: "chat-completions",
    baseUrl: "https://api.groq.com/openai",
    color: "#f55036",
    models: presetModels("llama-3.3-70b-versatile", "llama-3.1-8b-instant"),
  },
  {
    id: "moonshot",
    name: "Kimi (Moonshot)",
    icon: "/icons/moonshot.svg",
    protocol: "chat-completions",
    baseUrl: "https://api.moonshot.cn/v1",
    color: "#171717",
    models: presetModels("moonshot-v1-128k", "kimi-k2-0711-preview"),
  },
  {
    id: "qwen",
    name: "Qwen",
    icon: "/icons/qwen.svg",
    protocol: "chat-completions",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    color: "#615ced",
    models: presetModels("qwen3-coder-plus", "qwen-plus"),
  },
  {
    id: "zhipu",
    name: "Zhipu AI",
    icon: "/icons/zhipu.svg",
    protocol: "chat-completions",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    color: "#2563eb",
    models: presetModels("glm-4.5", "glm-4.5-air"),
  },
];

const PROVIDER_ICON_BY_KEYWORD: Array<{ keyword: string; icon: string }> = [
  { keyword: "openai", icon: "/icons/openai.svg" },
  { keyword: "gemini", icon: "/icons/gemini.svg" },
  { keyword: "google", icon: "/icons/gemini.svg" },
  { keyword: "anthropic", icon: "/icons/anthropic.svg" },
  { keyword: "claude", icon: "/icons/anthropic.svg" },
  { keyword: "minimax", icon: "/icons/minimax.svg" },
  { keyword: "doubao", icon: "/icons/doubao.svg" },
  { keyword: "bytedance", icon: "/icons/doubao.svg" },
  { keyword: "volc", icon: "/icons/doubao.svg" },
  { keyword: "deepseek", icon: "/icons/deepseek.svg" },
  { keyword: "groq", icon: "/icons/groq.svg" },
  { keyword: "openrouter", icon: "/icons/openrouter.svg" },
  { keyword: "moonshot", icon: "/icons/moonshot.svg" },
  { keyword: "kimi", icon: "/icons/moonshot.svg" },
  { keyword: "cursor", icon: "/icons/cursor.svg" },
  { keyword: "mimo", icon: "/icons/mimo.png" },
  { keyword: "qwen", icon: "/icons/qwen.svg" },
  { keyword: "zhipu", icon: "/icons/zhipu.svg" },
  { keyword: "mistral", icon: "/icons/mistral.svg" },
  { keyword: "cohere", icon: "/icons/cohere.svg" },
  { keyword: "perplexity", icon: "/icons/perplexity.svg" },
];

export function resolveBundledIconColor(icon: string | null): string | null {
  if (!icon?.startsWith("/icons/")) return null;
  if (icon === "/icons/kimi.svg") return "#111827";
  // Full-color official avatars; skip invert tinting.
  if (icon === "/icons/cursor.png" || icon === "/icons/mimo.png") return null;
  return PROVIDER_PRESETS.find((preset) => preset.icon === icon)?.color ?? "#57606a";
}

export function resolveProviderIcon(
  providerId: string,
  providerName: string,
  explicitIcon: string | null,
): string | null {
  if (explicitIcon?.trim()) return explicitIcon.trim();
  const target = `${providerId} ${providerName}`.toLowerCase();
  for (const rule of PROVIDER_ICON_BY_KEYWORD) {
    if (target.includes(rule.keyword)) return rule.icon;
  }
  return null;
}

export function createEmptyProviderModel(id = ""): UIProviderModel {
  return {
    id,
    name: id,
    contextWindow: 128_000,
    supportsVision: false,
  };
}

/** @deprecated Use WIRE_PROTOCOLS */
export const PROVIDER_API_TYPES = WIRE_PROTOCOLS;
