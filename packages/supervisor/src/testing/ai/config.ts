import { getEnvApiKey } from "@earendil-works/pi-ai";
import type { AiTestModelConfig } from "./types.js";

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readModelConfig(
  prefix: "AI_TEST_SUBJECT" | "AI_TEST_JUDGE",
  overrides: Partial<AiTestModelConfig> = {},
): AiTestModelConfig {
  const provider = overrides.provider ?? process.env[`${prefix}_PROVIDER`] ?? "minimax";
  const apiType = overrides.apiType ?? process.env[`${prefix}_API_TYPE`] ?? "anthropic-messages";
  return {
    provider,
    name: overrides.name ?? process.env[`${prefix}_NAME`] ?? provider,
    apiType,
    baseUrl: overrides.baseUrl ?? process.env[`${prefix}_BASE_URL`] ?? undefined,
    apiKey:
      overrides.apiKey ??
      process.env[`${prefix}_API_KEY`] ??
      getEnvApiKey(provider as never) ??
      undefined,
    model: overrides.model ?? process.env[`${prefix}_MODEL`] ?? "MiniMax-M2.7",
    contextWindow:
      overrides.contextWindow ?? positiveInt(process.env[`${prefix}_CONTEXT_WINDOW`], 128_000),
    maxTokens: overrides.maxTokens ?? positiveInt(process.env[`${prefix}_MAX_TOKENS`], 16_384),
  };
}

export function readAiSubjectConfig(overrides?: Partial<AiTestModelConfig>): AiTestModelConfig {
  return readModelConfig("AI_TEST_SUBJECT", overrides);
}

export function readAiJudgeConfig(overrides?: Partial<AiTestModelConfig>): AiTestModelConfig {
  return readModelConfig("AI_TEST_JUDGE", overrides);
}

export function hasAiTestCredentials(
  subject = readAiSubjectConfig(),
  judge = readAiJudgeConfig(),
): boolean {
  return Boolean(subject.apiKey && judge.apiKey);
}
