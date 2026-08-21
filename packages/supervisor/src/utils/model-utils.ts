import {
  getModel,
  type Api,
  type Model as PiModel,
  type Provider as PiProvider,
} from "@earendil-works/pi-ai";
import { toPiApi } from "../config/api-protocol.js";
import { getDb } from "../db/db.js";
import { getNativeApiKey } from "./native-auth.js";

export interface LLMConfig {
  model: PiModel<Api>;
  apiKey: string;
}

/** Build the complete LLM request configuration exclusively from the database. */
export async function resolveLLMConfig(modelId: number): Promise<LLMConfig> {
  const db = getDb();
  const model = db.getModelById(modelId);
  if (!model) throw new Error(`Model ${modelId} not found`);

  const provider = db.getProvider(model.providerId);
  if (!provider) throw new Error(`Provider ${model.providerId} not found`);
  if (!provider.isEnabled) throw new Error(`Provider ${provider.name} is disabled`);
  let apiKey = provider.apiKey;
  let api = toPiApi(provider.protocol);
  let baseUrl = provider.baseUrl;
  let piProvider = (provider.slug ?? `provider-${provider.id}`) as PiProvider;
  let catalogModel: PiModel<Api> | undefined;
  if (provider.authType === "oauth") {
    if (!provider.slug) throw new Error(`Provider ${provider.name} has no OAuth provider`);
    apiKey = (await getNativeApiKey(provider.slug)) ?? null;
    if (!apiKey) throw new Error(`Provider ${provider.name} is not logged in`);
    try {
      catalogModel = getModel(provider.slug as never, model.modelId as never) as PiModel<Api>;
    } catch {
      throw new Error(`Model ${model.modelId} is not supported by ${provider.name} OAuth`);
    }
    api = catalogModel.api;
    baseUrl = catalogModel.baseUrl;
    piProvider = catalogModel.provider as PiProvider;
  }
  if (!baseUrl?.trim()) throw new Error(`Provider ${provider.name} has no base URL`);
  if (!apiKey) throw new Error(`Provider ${provider.name} has no API key`);

  return {
    model: {
      id: model.modelId,
      name: model.name ?? model.modelId,
      api,
      provider: piProvider,
      baseUrl,
      reasoning: catalogModel?.reasoning ?? false,
      input: catalogModel?.input ?? (model.supportsVision ? ["text", "image"] : ["text"]),
      cost: catalogModel?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: catalogModel?.contextWindow ?? model.contextWindow,
      maxTokens: catalogModel?.maxTokens ?? 0,
    },
    apiKey,
  };
}
