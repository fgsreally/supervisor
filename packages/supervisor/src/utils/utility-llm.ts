import type { CompactionPreparation } from "@earendil-works/pi-agent-core";
import { compact } from "@earendil-works/pi-agent-core";
import { type Api, completeSimple, getEnvApiKey, type Model } from "@earendil-works/pi-ai";
import type { SupervisorDb } from "../db/db.js";
import { resolveModelWithProviderOverrides } from "./model-utils.js";
import { readSupervisorSettings, type SupervisorSettings } from "./supervisor-settings.js";

export interface UtilityModelAuth {
  model: Model<Api>;
  apiKey: string;
  headers?: Record<string, string>;
}

export interface UtilityCompactionResult {
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: unknown;
}

export type UtilityTaskTag = "summary" | "commit-message" | "session-title" | "review";

export function resolveUtilityModelConfig(
  settings: SupervisorSettings = readSupervisorSettings(),
): {
  provider: string;
  modelId: string;
} | null {
  if (!settings.utilityProvider || !settings.utilityModelId) return null;
  return { provider: settings.utilityProvider, modelId: settings.utilityModelId };
}

function extractText(content: Array<{ type: string; text?: string }> | string): string {
  if (typeof content === "string") return content.trim();
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text" && !!part.text)
    .map((part) => part.text)
    .join("")
    .trim();
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function hasTag(tags: string[], target: string): boolean {
  const expected = normalizeTag(target);
  return tags.some((tag) => normalizeTag(tag) === expected);
}

export async function resolveTaggedModelAuth(
  db: Pick<SupervisorDb, "listProviders" | "listModelsByProvider" | "getProvider">,
  tag: UtilityTaskTag,
): Promise<UtilityModelAuth | null> {
  const providers = db.listProviders().filter((provider) => provider.isEnabled);
  for (const provider of providers) {
    const model = db.listModelsByProvider(provider.id).find((item) => hasTag(item.tags, tag));
    if (!model) continue;
    const resolvedModel = resolveModelWithProviderOverrides(db, provider.id, model.modelId);
    if (!resolvedModel) continue;
    const envKey = getEnvApiKey(resolvedModel.provider);
    if (envKey) {
      return { model: resolvedModel, apiKey: envKey };
    }
    const providerConfig = db.getProvider(provider.id);
    if (providerConfig?.apiKey) {
      return { model: resolvedModel, apiKey: providerConfig.apiKey };
    }
  }
  return null;
}

async function completeUtilityText(auth: UtilityModelAuth, prompt: string): Promise<string> {
  const result = await completeSimple(auth.model, {
    messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
  });
  return extractText(result.content as Array<{ type: string; text?: string }>);
}

export async function generateSessionTitle(
  auth: UtilityModelAuth,
  userText: string,
  assistantSummary: string,
): Promise<string> {
  const prompt = [
    "Generate a short chat session title (6-20 Chinese or English characters).",
    "Return ONLY the title text, no quotes or punctuation wrapper.",
    "",
    `User: ${userText.slice(0, 500)}`,
    `Assistant: ${assistantSummary.slice(0, 500)}`,
  ].join("\n");
  const title = await completeUtilityText(auth, prompt);
  return title
    .replace(/^["'`]+|["'`]+$/g, "")
    .slice(0, 40)
    .trim();
}

export async function generateCommitMessage(
  auth: UtilityModelAuth,
  turnSummary: string,
  gitDiffStat: string,
): Promise<string> {
  const prompt = [
    "Write a concise git commit subject line for the agent's latest work.",
    "Return ONLY one line (max 72 chars), imperative mood, no quotes.",
    "",
    `Turn summary: ${turnSummary.slice(0, 800)}`,
    `Diff stat:\n${gitDiffStat.slice(0, 1200)}`,
  ].join("\n");
  const message = await completeUtilityText(auth, prompt);
  return message.split("\n")[0]?.trim().slice(0, 72) || "pi: agent changes";
}

export async function compactWithUtilityModel(
  auth: UtilityModelAuth,
  preparation: CompactionPreparation,
  customInstructions?: string,
): Promise<UtilityCompactionResult> {
  return compact(
    preparation,
    auth.model,
    auth.apiKey,
    auth.headers,
    customInstructions,
    undefined,
    "off",
  );
}
