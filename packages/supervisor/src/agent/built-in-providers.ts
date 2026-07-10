export interface BuiltInProvider {
	id: string;
	name: string;
	icon: string | null;
	apiType: "anthropic-messages" | "openai-compatible";
	baseUrl: string | null;
	defaultModels: string[];
}

export const BUILT_IN_PROVIDERS: BuiltInProvider[] = [
	{
		id: "anthropic",
		name: "Anthropic",
		icon: "simple-icons:anthropic",
		apiType: "anthropic-messages",
		baseUrl: null,
		defaultModels: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
	},
	{
		id: "openai",
		name: "OpenAI",
		icon: "simple-icons:openai",
		apiType: "openai-compatible",
		baseUrl: null,
		defaultModels: ["gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		icon: "simple-icons:deepseek",
		apiType: "openai-compatible",
		baseUrl: "https://api.deepseek.com",
		defaultModels: ["deepseek-chat", "deepseek-reasoner"],
	},
	{
		id: "minimax",
		name: "MiniMax",
		icon: "mdi:hexagon-multiple",
		apiType: "anthropic-messages",
		baseUrl: "https://api.minimax.io/anthropic",
		defaultModels: ["MiniMax-M2.7", "MiniMax-M2.5"],
	},
	{
		id: "minimax-cn",
		name: "MiniMax (国内)",
		icon: "mdi:hexagon-multiple",
		apiType: "anthropic-messages",
		baseUrl: "https://api.minimaxi.com/anthropic",
		defaultModels: ["MiniMax-M2.7", "MiniMax-M2.5"],
	},
	{
		id: "doubao",
		name: "豆包 (ByteDance)",
		icon: "mdi:alpha-d-circle",
		apiType: "anthropic-messages",
		baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
		defaultModels: ["doubao-pro-32k", "doubao-lite-32k", "doubao-pro-128k"],
	},
	{
		id: "groq",
		name: "Groq",
		icon: "simple-icons:groq",
		apiType: "openai-compatible",
		baseUrl: "https://api.groq.com/openai",
		defaultModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
	},
	{
		id: "openrouter",
		name: "OpenRouter",
		icon: "simple-icons:openrouter",
		apiType: "openai-compatible",
		baseUrl: "https://openrouter.ai/api",
		defaultModels: [
			"anthropic/claude-3.5-sonnet",
			"openai/gpt-4o",
			"google/gemini-2.0-flash",
			"meta-llama/llama-3.3-70b-instruct",
		],
	},
];
