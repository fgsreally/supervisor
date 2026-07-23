import type { CompactionPreparation } from "@earendil-works/pi-agent-core";
import { compact } from "@earendil-works/pi-agent-core";
import { type Api, completeSimple, getEnvApiKey, type Model } from "@earendil-works/pi-ai";
import type { SupervisorDb } from "../db/db.js";
import { resolveModelWithProviderOverrides } from "./model-utils.js";
import {
  isFeatureModelRef,
  readSupervisorSettings,
  type FeatureModelRef,
  type SupervisorSettings,
  type UtilityFeature,
} from "./supervisor-settings.js";

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

export type { UtilityFeature };

type FeatureModelDb = Pick<
  SupervisorDb,
  "listProviders" | "listModelsByProvider" | "getProvider" | "getModel"
>;

function extractText(content: Array<{ type: string; text?: string }> | string): string {
  if (typeof content === "string") return content.trim();
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text" && !!part.text)
    .map((part) => part.text)
    .join("")
    .trim();
}

/** Read the configured model ref for a feature (no fallback). */
export function getFeatureModelRef(
  feature: UtilityFeature,
  settings: SupervisorSettings = readSupervisorSettings(),
): FeatureModelRef | null {
  const configured = settings.featureModels?.[feature];
  if (isFeatureModelRef(configured)) {
    return {
      providerId: configured.providerId,
      modelId: configured.modelId.trim(),
    };
  }
  return null;
}

/**
 * Resolve feature model binding.
 * Only the feature-specific setting counts; missing => null (caller skips).
 */
export function resolveFeatureModelRef(
  feature: UtilityFeature,
  settings: SupervisorSettings = readSupervisorSettings(),
): FeatureModelRef | null {
  return getFeatureModelRef(feature, settings);
}

async function resolveAuthFromRef(
  db: FeatureModelDb,
  ref: FeatureModelRef,
): Promise<UtilityModelAuth | null> {
  const provider = db.getProvider(ref.providerId);
  if (!provider?.isEnabled) return null;
  if (!db.getModel(ref.providerId, ref.modelId)) return null;

  const resolvedModel = resolveModelWithProviderOverrides(db, ref.providerId, ref.modelId);
  if (!resolvedModel) return null;

  const envKey = getEnvApiKey(resolvedModel.provider);
  if (envKey) return { model: resolvedModel, apiKey: envKey };
  if (provider.apiKey) return { model: resolvedModel, apiKey: provider.apiKey };
  return null;
}

/**
 * Resolve an LLM for a settings-configured utility feature.
 * Missing binding / missing credentials => null (caller should skip the feature).
 */
export async function resolveFeatureModelAuth(
  db: FeatureModelDb,
  feature: UtilityFeature,
  settings: SupervisorSettings = readSupervisorSettings(),
): Promise<UtilityModelAuth | null> {
  const ref = resolveFeatureModelRef(feature, settings);
  if (!ref) return null;
  return resolveAuthFromRef(db, ref);
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
  return message.split("\n")[0]?.trim().slice(0, 72) || "sv: agent changes";
}

export async function generateDailyWorkDigest(
  auth: UtilityModelAuth,
  dayKey: string,
  sections: Array<{
    projectName: string;
    cwd: string;
    commits: Array<{ shortHash: string; subject: string }>;
  }>,
): Promise<string> {
  const body = sections
    .map((section) => {
      const lines = section.commits.map((commit) => `- ${commit.shortHash} ${commit.subject}`);
      return [`## ${section.projectName}`, `cwd: ${section.cwd}`, ...lines].join("\n");
    })
    .join("\n\n");

  const prompt = [
    `Summarize the supervisor (sv) git work done on ${dayKey}.`,
    "Write in Chinese when commits are mostly Chinese; otherwise English.",
    "Focus on what was accomplished, group related commits, and keep it concise.",
    "Return markdown only. Do not invent commits that are not listed.",
    "",
    body.slice(0, 12000),
  ].join("\n");
  return completeUtilityText(auth, prompt);
}

export interface TaskDecompositionSubtask {
  title: string;
  prompt: string;
}

export async function generateTaskDecomposition(
  auth: UtilityModelAuth,
  input: { title: string; description?: string; projectName?: string; cwd?: string },
): Promise<TaskDecompositionSubtask[]> {
  const prompt = [
    "Decompose the user task into concrete executable subtasks for coding agents.",
    "Return ONLY valid JSON with shape: {\"subtasks\":[{\"title\":\"...\",\"prompt\":\"...\"}]}",
    "Rules:",
    "- 2 to 8 subtasks",
    "- each prompt must be a self-contained instruction the agent can start from",
    "- titles should be short",
    "- do not wrap JSON in markdown fences",
    "",
    `Title: ${input.title.slice(0, 200)}`,
    `Description: ${(input.description ?? "").slice(0, 2000)}`,
    `Project: ${input.projectName ?? ""}`,
    `Cwd: ${input.cwd ?? ""}`,
  ].join("\n");

  const text = await completeUtilityText(auth, prompt);
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("task decompose model did not return valid JSON");
  }
  const subtasks = (parsed as { subtasks?: unknown }).subtasks;
  if (!Array.isArray(subtasks) || subtasks.length === 0) {
    throw new Error("task decompose model returned no subtasks");
  }
  return subtasks
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { title?: unknown; prompt?: unknown };
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const promptText = typeof row.prompt === "string" ? row.prompt.trim() : "";
      if (!title || !promptText) return null;
      return { title: title.slice(0, 120), prompt: promptText.slice(0, 4000) };
    })
    .filter((item): item is TaskDecompositionSubtask => item !== null)
    .slice(0, 8);
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
