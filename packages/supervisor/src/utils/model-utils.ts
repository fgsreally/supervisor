import { getModel, type Api, type KnownProvider, type Model } from "@earendil-works/pi-ai";
import { normalizeApiProtocol, toPiApi } from "../config/api-protocol.js";

/**
 * Minimal provider shape needed for model override resolution.
 */
interface ProviderLike {
  slug?: string | null;
  baseUrl: string | null;
  protocol: string;
}

/**
 * Resolve a model from the pi-ai built-in registry, then apply the provider's
 * endpoint and vendor-neutral wire protocol. The provider slug selects a model
 * registry; protocol selects only the HTTP wire format.
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

  const protocol = normalizeApiProtocol(providerConfig.protocol);
  if (!protocol) return undefined;

  const fallbackProvider = protocol === "messages" ? "anthropic" : "openai";
  const model =
    (providerConfig.slug
      ? getModel(providerConfig.slug as KnownProvider, modelId as never)
      : undefined) ?? getModel(fallbackProvider, modelId as never);
  if (!model) return undefined;

  const api = toPiApi(protocol);

  const needsOverride = providerConfig.baseUrl != null || api !== model.api;
  if (!needsOverride) return model;

  return {
    ...model,
    ...(providerConfig.baseUrl != null ? { baseUrl: providerConfig.baseUrl } : {}),
    ...(api !== model.api ? { api } : {}),
  };
}
