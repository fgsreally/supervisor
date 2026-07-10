import type { ProviderApiType } from "@/api";
import type { UIProviderModel } from "@/types/ui";

export const PROVIDER_API_TYPES: Array<{ value: ProviderApiType; label: string }> = [
	{ value: "anthropic-messages", label: "Anthropic Messages" },
	{ value: "openai-compatible", label: "OpenAI Compatible" },
];

export interface ProviderPreset {
	id: string;
	name: string;
	icon: string;
	apiType: ProviderApiType;
	baseUrl: string | null;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
	{
		id: "openai",
		name: "OpenAI",
		icon: "/icons/openai.svg",
		apiType: "openai-compatible",
		baseUrl: null,
	},
	{
		id: "gemini",
		name: "Gemini",
		icon: "/icons/gemini.svg",
		apiType: "openai-compatible",
		baseUrl: null,
	},
	{
		id: "anthropic",
		name: "Claude (Anthropic)",
		icon: "/icons/anthropic.svg",
		apiType: "anthropic-messages",
		baseUrl: null,
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		icon: "/icons/deepseek.svg",
		apiType: "openai-compatible",
		baseUrl: "https://api.deepseek.com",
	},
	{
		id: "minimax",
		name: "MiniMax",
		icon: "/icons/minimax.svg",
		apiType: "anthropic-messages",
		baseUrl: "https://api.minimax.io/anthropic",
	},
	{
		id: "minimax-cn",
		name: "MiniMax (国内)",
		icon: "/icons/minimax.svg",
		apiType: "anthropic-messages",
		baseUrl: "https://api.minimaxi.com/anthropic",
	},
	{
		id: "doubao",
		name: "豆包 (ByteDance)",
		icon: "/icons/doubao.svg",
		apiType: "anthropic-messages",
		baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
	},
	{
		id: "groq",
		name: "Groq",
		icon: "/icons/groq.svg",
		apiType: "openai-compatible",
		baseUrl: "https://api.groq.com/openai",
	},
	{
		id: "openrouter",
		name: "OpenRouter",
		icon: "/icons/openrouter.svg",
		apiType: "openai-compatible",
		baseUrl: "https://openrouter.ai/api",
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
];

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
		maxTokens: 16_384,
		supportsMultimodal: false,
		tags: [],
	};
}
