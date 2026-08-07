import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decryptApiKey } from "./encrypt.js";
import { getSupervisorHome } from "./supervisor-home.js";

/**
 * Settings bind a single 助手模型 (Watson / 华生).
 * Legacy per-feature keys are still accepted when reading for migration.
 */
export const UTILITY_FEATURES = ["assistant"] as const;

export type UtilityFeature = (typeof UTILITY_FEATURES)[number];

/** Old keys — still read as fallback when `assistant` is unset. */
export const LEGACY_UTILITY_FEATURES = [
  "commit-message",
  "session-title",
  "summary",
  "daily-work",
  "task-decompose",
  "project-description",
] as const;

export interface FeatureModelRef {
  providerId: number;
  modelId: string;
}

export type FeatureModelMap = Partial<Record<string, FeatureModelRef>>;

export interface SupervisorSettings {
  /** @deprecated Prefer featureModels.assistant */
  utilityProvider?: string;
  /** @deprecated Prefer featureModels.assistant */
  utilityModelId?: string;
  /** Model bindings; only `assistant` is written by Settings UI. */
  featureModels?: FeatureModelMap;
  /** Optional SQLite path; project `.supervisor/config.json` takes precedence. */
  dbPath?: string;
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
  /** Volcengine console App ID (not secret). */
  doubaoSpeechAppId?: string;
  doubaoSpeechAccessTokenEncrypted?: string;
}

/** Fixed resource id for Doubao streaming ASR 2.0 (hourly). */
export const DOUBAO_SPEECH_RESOURCE_ID = "volc.seedasr.sauc.duration";

/** WebSocket handshake headers for legacy console (APP ID + Access Token). */
export function buildDoubaoSpeechWsHeaders(
  appId: string,
  accessToken: string,
): Record<string, string> {
  return {
    "X-Api-App-Key": appId.trim(),
    "X-Api-Access-Key": accessToken.trim(),
    "X-Api-Resource-Id": DOUBAO_SPEECH_RESOURCE_ID,
    "X-Api-Connect-Id": randomUUID(),
    "X-Api-Request-Id": randomUUID(),
    "X-Api-Sequence": "-1",
  };
}

export function isDoubaoSpeechConfigured(settings: SupervisorSettings): boolean {
  return Boolean(settings.doubaoSpeechAppId?.trim() && settings.doubaoSpeechAccessTokenEncrypted);
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
  return join(getSupervisorHome(), "settings.json");
}

export function readSupervisorSettings(): SupervisorSettings {
  const path = getSupervisorSettingsPath();
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as SupervisorSettings & {
      doubaoSpeechAppIdEncrypted?: string;
      doubaoSpeechApiKeyEncrypted?: string;
    };
    const settings: SupervisorSettings = { ...DEFAULT_SETTINGS, ...parsed };
    if (!settings.doubaoSpeechAppId?.trim() && parsed.doubaoSpeechAppIdEncrypted) {
      try {
        settings.doubaoSpeechAppId = decryptApiKey(parsed.doubaoSpeechAppIdEncrypted).trim();
      } catch {
        // ignore legacy migration failures
      }
    }
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSupervisorSettings(patch: Partial<SupervisorSettings>): SupervisorSettings {
  const current = readSupervisorSettings();
  const next: SupervisorSettings = { ...current };
  for (const [key, value] of Object.entries(patch) as [keyof SupervisorSettings, unknown][]) {
    if (value === undefined) delete next[key];
    else next[key] = value as never;
  }
  const path = getSupervisorSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return next;
}
