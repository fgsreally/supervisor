import type { Model, Provider } from "@/api";
import { resolveProviderIcon } from "@/constants/providers";
import type { UIProvider, UIProviderModel } from "@/types/ui";

export function modelToUI(model: Model): UIProviderModel {
	return {
		id: model.modelId,
		name: model.name ?? model.modelId,
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		supportsMultimodal: model.supportsMultimodal,
		tags: model.tags,
	};
}

export function providerToUI(provider: Provider, models: Model[]): UIProvider {
	return {
		id: provider.id,
		slug: provider.slug ?? null,
		name: provider.name,
		icon: resolveProviderIcon(provider.id, provider.name, provider.icon),
		apiType: provider.apiType as UIProvider["apiType"],
		baseUrl: provider.baseUrl,
		isEnabled: provider.isEnabled,
		models: models.map(modelToUI),
	};
}
