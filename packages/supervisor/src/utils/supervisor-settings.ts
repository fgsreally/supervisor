import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Features that can bind a dedicated utility model in settings. */
export const UTILITY_FEATURES = [
  "commit-message",
  "session-title",
  "summary",
  "daily-work",
  "task-decompose",
] as const;

export type UtilityFeature = (typeof UTILITY_FEATURES)[number];

export interface FeatureModelRef {
  providerId: number;
  modelId: string;
}

export type FeatureModelMap = Partial<Record<UtilityFeature, FeatureModelRef>>;

export interface SupervisorSettings {
  /** @deprecated Prefer featureModels */
  utilityProvider?: string;
  /** @deprecated Prefer featureModels */
  utilityModelId?: string;
  /** Per-feature model bindings configured in Settings. */
  featureModels?: FeatureModelMap;
  browserMode?: "headless" | "headed";
  webSearchProvider?: "duckduckgo" | "tavily" | "brave" | "serper" | "firecrawl";
  webFetchProvider?:
    | "native"
    | "tavily"
    | "firecrawl"
    | "native-then-tavily"
    | "native-then-firecrawl";
  tavilyApiKeyEnv?: string;
  braveApiKeyEnv?: string;
  serperApiKeyEnv?: string;
  firecrawlApiKeyEnv?: string;
  tavilyApiKeyEncrypted?: string;
  braveApiKeyEncrypted?: string;
  serperApiKeyEncrypted?: string;
  firecrawlApiKeyEncrypted?: string;
  speechRecognitionMode?: "browser" | "qwen" | "doubao";
  speechRecognitionLanguage?: string;
  speechApiKeyEncrypted?: string;
  doubaoSpeechApiKeyEncrypted?: string;
  doubaoSpeechResourceId?: string;
}

const DEFAULT_SETTINGS: SupervisorSettings = {};

export function isUtilityFeature(value: string): value is UtilityFeature {
  return (UTILITY_FEATURES as readonly string[]).includes(value);
}

export function isFeatureModelRef(value: unknown): value is FeatureModelRef {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.providerId === "number" &&
    Number.isInteger(item.providerId) &&
    item.providerId > 0 &&
    typeof item.modelId === "string" &&
    item.modelId.trim().length > 0
  );
}

export function getSupervisorSettingsPath(): string {
  return join(homedir(), ".pi", "supervisor", "settings.json");
}

export function readSupervisorSettings(): SupervisorSettings {
  const path = getSupervisorSettingsPath();
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as SupervisorSettings;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSupervisorSettings(patch: Partial<SupervisorSettings>): SupervisorSettings {
  const current = readSupervisorSettings();
  const next = { ...current, ...patch };
  const path = getSupervisorSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return next;
}
