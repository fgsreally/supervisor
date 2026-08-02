import type { ApiProtocol } from "./api-protocol.js";

export interface BuiltInProvider {
  id: string;
  name: string;
  icon: string | null;
  protocol: ApiProtocol;
  baseUrl: string | null;
  defaultModels: string[];
}

export const BUILT_IN_PROVIDERS: BuiltInProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    icon: "simple-icons:anthropic",
    protocol: "messages",
    baseUrl: null,
    defaultModels: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: "simple-icons:openai",
    protocol: "responses",
    baseUrl: null,
    defaultModels: ["gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "simple-icons:deepseek",
    protocol: "chat-completions",
    baseUrl: "https://api.deepseek.com",
    defaultModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "minimax",
    name: "MiniMax",
    icon: "mdi:hexagon-multiple",
    protocol: "messages",
    baseUrl: "https://api.minimax.io/anthropic",
    defaultModels: ["MiniMax-M2.7", "MiniMax-M2.5"],
  },
  {
    id: "minimax-cn",
    name: "MiniMax (国内)",
    icon: "mdi:hexagon-multiple",
    protocol: "messages",
    baseUrl: "https://api.minimaxi.com/anthropic",
    defaultModels: ["MiniMax-M2.7", "MiniMax-M2.5"],
  },
  {
    id: "doubao",
    name: "豆包 (ByteDance)",
    icon: "mdi:alpha-d-circle",
    protocol: "messages",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
    defaultModels: ["doubao-pro-32k", "doubao-lite-32k", "doubao-pro-128k"],
  },
  {
    id: "groq",
    name: "Groq",
    icon: "simple-icons:groq",
    protocol: "chat-completions",
    baseUrl: "https://api.groq.com/openai",
    defaultModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: "simple-icons:openrouter",
    protocol: "chat-completions",
    baseUrl: "https://openrouter.ai/api",
    defaultModels: [
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "google/gemini-2.0-flash",
      "meta-llama/llama-3.3-70b-instruct",
    ],
  },
];
