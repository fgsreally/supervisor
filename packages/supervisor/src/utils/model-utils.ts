import { getModel, type Api, type KnownProvider, type Model } from "@earendil-works/pi-ai";

/**
 * Minimal provider shape needed for model override resolution.
 */
interface ProviderLike {
  baseUrl: string | null;
  apiType: string;
}

/**
 * Resolve a model from the pi-ai built-in registry, then apply overrides from
 * the DB provider's baseUrl and apiType. This lets CLI-configured providers
 * (e.g. Minimax at api.minimax.chat/v1 with openai-responses API) take effect
 * even when pi-ai's hardcoded registry specifies different values.
 *
 * Returns undefined when neither pi-ai nor the DB has a match.
 */
export function resolveModelWithProviderOverrides(
  db: { getProvider: (id: number) => ProviderLike | undefined },
  providerId: number,
  modelId: string,
): Model<Api> | undefined {
  const providerConfig = db.getProvider(providerId);
  if (!providerConfig) return undefined;

  const model = getModel(providerConfig.apiType as KnownProvider, modelId as never);
  if (!model) return undefined;

  const needsOverride =
    providerConfig.baseUrl != null ||
    (providerConfig.apiType != null && providerConfig.apiType !== model.api);
  if (!needsOverride) return model;

  return {
    ...model,
    ...(providerConfig.baseUrl != null ? { baseUrl: providerConfig.baseUrl } : {}),
    ...(providerConfig.apiType != null && providerConfig.apiType !== model.api
      ? { api: providerConfig.apiType as never }
      : {}),
  };
}
