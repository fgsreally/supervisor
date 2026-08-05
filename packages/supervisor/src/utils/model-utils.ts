import type { Api, Model as PiModel, Provider as PiProvider } from "@earendil-works/pi-ai";
import { toPiApi } from "../config/api-protocol.js";
import { getDb } from "../db/db.js";

export interface LLMConfig {
  model: PiModel<Api>;
  apiKey: string;
}

/** Build the complete LLM request configuration exclusively from the database. */
export function resolveLLMConfig(modelId: number): LLMConfig {
  const db = getDb();
  const model = db.getModelById(modelId);
  if (!model) throw new Error(`Model ${modelId} not found`);

  const provider = db.getProvider(model.providerId);
  if (!provider) throw new Error(`Provider ${model.providerId} not found`);
  if (!provider.isEnabled) throw new Error(`Provider ${provider.name} is disabled`);
  if (!provider.baseUrl?.trim()) throw new Error(`Provider ${provider.name} has no base URL`);
  if (!provider.apiKey) throw new Error(`Provider ${provider.name} has no API key`);

  return {
    model: {
      id: model.modelId,
      name: model.name ?? model.modelId,
      api: toPiApi(provider.protocol),
      provider: (provider.slug ?? `provider-${provider.id}`) as PiProvider,
      baseUrl: provider.baseUrl,
      reasoning: false,
      input: model.supportsVision ? ["text", "image"] : ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.contextWindow,
      maxTokens: 0,
    },
    apiKey: provider.apiKey,
  };
}
