import type { Model, Provider } from "@/api";
import { resolveProviderIcon } from "@/constants/providers";
import type { UIProvider, UIProviderModel } from "@/types/ui";

export function modelToUI(model: Model): UIProviderModel {
  return {
    id: model.id,
    name: model.name ?? model.modelId,
    contextWindow: model.contextWindow,
    supportsVision: model.supportsVision,
  };
}

export function providerToUI(provider: Provider, models: Model[]): UIProvider {
  return {
    id: provider.id,
    slug: provider.slug ?? null,
    name: provider.name,
    icon: resolveProviderIcon(provider.id, provider.name, provider.icon),
    protocol: provider.protocol as UIProvider["protocol"],
    baseUrl: provider.baseUrl,
    isEnabled: provider.isEnabled,
    models: models.map(modelToUI),
  };
}
