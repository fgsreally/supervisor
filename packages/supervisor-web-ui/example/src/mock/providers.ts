export type ProviderApiType = 'anthropic-messages' | 'openai-compatible'

export const PROVIDER_API_TYPES: Array<{ value: ProviderApiType; label: string }> = [
	{ value: 'anthropic-messages', label: 'Anthropic Messages' },
	{ value: 'openai-compatible', label: 'OpenAI Compatible' },
]

export interface MockProviderModel {
	id: string
	name: string
	contextWindow: number
	maxTokens: number
	supportsMultimodal: boolean
}

export interface MockProvider {
	id: string
	name: string
	apiType: ProviderApiType
	baseUrl: string | null
	activeModelId: string
	isEnabled: boolean
	models: MockProviderModel[]
}

export function createEmptyProviderModel(id = ''): MockProviderModel {
	return {
		id,
		name: id,
		contextWindow: 128_000,
		maxTokens: 16_384,
		supportsMultimodal: false,
	}
}

export const mockProviders: MockProvider[] = [
	{
		id: 'anthropic',
		name: 'Anthropic',
		apiType: 'anthropic-messages',
		baseUrl: null,
		activeModelId: 'claude-sonnet-4-6',
		isEnabled: true,
		models: [
			{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200_000, maxTokens: 64_000, supportsMultimodal: true },
			{ id: 'claude-opus-4-6', name: 'Claude Opus 4.6', contextWindow: 200_000, maxTokens: 32_000, supportsMultimodal: true },
			{ id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextWindow: 200_000, maxTokens: 8_192, supportsMultimodal: true },
		],
	},
	{
		id: 'openai',
		name: 'OpenAI',
		apiType: 'openai-compatible',
		baseUrl: null,
		activeModelId: 'gpt-4o',
		isEnabled: true,
		models: [
			{ id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128_000, maxTokens: 16_384, supportsMultimodal: true },
			{ id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128_000, maxTokens: 16_384, supportsMultimodal: true },
			{ id: 'o3', name: 'o3', contextWindow: 200_000, maxTokens: 100_000, supportsMultimodal: true },
			{ id: 'o4-mini', name: 'o4-mini', contextWindow: 200_000, maxTokens: 100_000, supportsMultimodal: true },
		],
	},
	{
		id: 'deepseek',
		name: 'DeepSeek',
		apiType: 'openai-compatible',
		baseUrl: 'https://api.deepseek.com',
		activeModelId: 'deepseek-chat',
		isEnabled: true,
		models: [
			{ id: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 64_000, maxTokens: 8_192, supportsMultimodal: false },
			{ id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', contextWindow: 64_000, maxTokens: 8_192, supportsMultimodal: false },
		],
	},
	{
		id: 'minimax',
		name: 'MiniMax',
		apiType: 'anthropic-messages',
		baseUrl: 'https://api.minimax.io/anthropic',
		activeModelId: 'MiniMax-M2.7',
		isEnabled: false,
		models: [
			{ id: 'MiniMax-M2.7', name: 'MiniMax M2.7', contextWindow: 1_000_000, maxTokens: 16_384, supportsMultimodal: true },
			{ id: 'MiniMax-M2.5', name: 'MiniMax M2.5', contextWindow: 1_000_000, maxTokens: 16_384, supportsMultimodal: true },
		],
	},
	{
		id: 'openrouter',
		name: 'OpenRouter',
		apiType: 'openai-compatible',
		baseUrl: 'https://openrouter.ai/api',
		activeModelId: 'anthropic/claude-3.5-sonnet',
		isEnabled: true,
		models: [
			{ id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextWindow: 200_000, maxTokens: 8_192, supportsMultimodal: true },
			{ id: 'openai/gpt-4o', name: 'GPT-4o', contextWindow: 128_000, maxTokens: 16_384, supportsMultimodal: true },
			{ id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1_000_000, maxTokens: 8_192, supportsMultimodal: true },
		],
	},
]

export {
	mockStore,
	getProviderById,
	getProviderForAgent,
	getAgentsUsingProvider,
	updateProvider,
	setProviderActiveModel,
	addProvider,
	addProviderModel,
	updateProviderModel,
	removeProviderModel,
} from './store'
