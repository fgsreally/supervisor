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
  /** `browser` 已废弃，读取时视为 `local` */
  speechRecognitionMode?: "local" | "qwen" | "doubao" | "browser";
  speechRecognitionLanguage?: string;
  /** 本地 sherpa-onnx 模型 id，见 LOCAL_SPEECH_MODELS */
  localSpeechModelId?: string;
  speechApiKeyEncrypted?: string;
  /** Volcengine console App ID (not secret). */
  doubaoSpeechAppId?: string;
  doubaoSpeechAccessTokenEncrypted?: string;
  /** Doubao streaming ASR billing preset (resource id + endpoint). */
  doubaoSpeechPreset?: DoubaoSpeechPresetId;
  /** Firebase Cloud Messaging service account JSON (encrypted). */
  pushFcmServiceAccountEncrypted?: string;
  /** Apple Push Notification auth key (.p8 PEM, encrypted). */
  pushApnsKeyEncrypted?: string;
  pushApnsKeyId?: string;
  pushApnsTeamId?: string;
  pushApnsBundleId?: string;
  pushApnsProduction?: boolean;
  /** OPPO Push / fluid cloud — app_key (or legacy client id). */
  pushOppoAppKey?: string;
  /** OPPO Push master_secret (encrypted). Falls back to pushOppoClientSecretEncrypted. */
  pushOppoMasterSecretEncrypted?: string;
  /** @deprecated Use pushOppoAppKey — kept for older configs. */
  pushOppoClientId?: string;
  /** @deprecated Use pushOppoMasterSecretEncrypted. */
  pushOppoClientSecretEncrypted?: string;
  /** Assigned by OPPO after fluid cloud review, e.g. Example.Progress */
  pushOppoIntentName?: string;
  pushOppoServiceIdLauncher?: string;
  pushOppoServiceIdFluidCloud?: string;
  /** OPPO Push intent_env: true = test (1), false = production (0). */
  pushOppoTestEnv?: boolean;
}

/** Fixed resource id for Doubao streaming ASR 2.0 (hourly). */
export const DOUBAO_SPEECH_RESOURCE_ID = "volc.seedasr.sauc.duration";

export type DoubaoSpeechPresetId =
  | "2.0-duration"
  | "2.0-concurrent"
  | "1.0-duration"
  | "1.0-concurrent"
  | "2.0-duration-async"
  | "1.0-duration-async";

export const DOUBAO_SPEECH_PRESETS: Record<
  DoubaoSpeechPresetId,
  { resourceId: string; wsUrl: string; label: string }
> = {
  // Matches the previously working supervisor endpoint (appid+token).
  "2.0-duration": {
    resourceId: "volc.seedasr.sauc.duration",
    wsUrl: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
    label: "2.0 小时版",
  },
  "2.0-duration-async": {
    resourceId: "volc.seedasr.sauc.duration",
    wsUrl: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async",
    label: "2.0 小时版（async）",
  },
  "2.0-concurrent": {
    resourceId: "volc.seedasr.sauc.concurrent",
    wsUrl: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
    label: "2.0 并发版",
  },
  "1.0-duration": {
    resourceId: "volc.bigasr.sauc.duration",
    wsUrl: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
    label: "1.0 小时版",
  },
  "1.0-duration-async": {
    resourceId: "volc.bigasr.sauc.duration",
    wsUrl: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async",
    label: "1.0 小时版（async）",
  },
  "1.0-concurrent": {
    resourceId: "volc.bigasr.sauc.concurrent",
    wsUrl: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
    label: "1.0 并发版",
  },
};

const DOUBAO_SPEECH_PRESET_IDS = Object.keys(DOUBAO_SPEECH_PRESETS) as DoubaoSpeechPresetId[];

export function isDoubaoSpeechPresetId(value: string): value is DoubaoSpeechPresetId {
  return (DOUBAO_SPEECH_PRESET_IDS as readonly string[]).includes(value);
}

export function resolveDoubaoSpeechPreset(
  presetId?: string,
): (typeof DOUBAO_SPEECH_PRESETS)[DoubaoSpeechPresetId] & { id: DoubaoSpeechPresetId } {
  // Migrate renamed preset ids from earlier builds.
  const normalized = presetId === "2.0-duration-sync" ? "2.0-duration" : presetId;
  const id =
    normalized && isDoubaoSpeechPresetId(normalized) ? normalized : ("2.0-duration" as const);
  return { id, ...DOUBAO_SPEECH_PRESETS[id] };
}

/** Prefer saved preset, then try common resource/URL combinations. */
export function doubaoSpeechPresetsToTry(preferred?: string): DoubaoSpeechPresetId[] {
  const order: DoubaoSpeechPresetId[] = [
    "2.0-duration",
    "2.0-duration-async",
    "1.0-duration",
    "1.0-duration-async",
    "2.0-concurrent",
    "1.0-concurrent",
  ];
  const preferredId = preferred
    ? resolveDoubaoSpeechPreset(preferred).id
    : null;
  if (!preferredId) return order;
  return [preferredId, ...order.filter((id) => id !== preferredId)];
}

export function resolveDoubaoSpeechFromSettings(settings: SupervisorSettings) {
  return resolveDoubaoSpeechPreset(settings.doubaoSpeechPreset);
}

/** Strip common paste noise from console credentials. */
export function normalizeDoubaoSpeechCredential(value: string): string {
  let next = value.trim().replace(/^["']|["']$/g, "");
  // Users sometimes paste "Bearer; xxx" or "Bearer xxx" from old docs.
  next = next.replace(/^bearer\s*;\s*/i, "").replace(/^bearer\s+/i, "").trim();
  return next;
}

/** WebSocket handshake headers (legacy APP ID + Access Token, or new-console X-Api-Key). */
export function buildDoubaoSpeechWsHeaders(
  appId: string,
  accessToken: string,
  resourceId: string = DOUBAO_SPEECH_RESOURCE_ID,
): Record<string, string> {
  const trimmedAppId = normalizeDoubaoSpeechCredential(appId);
  const trimmedToken = normalizeDoubaoSpeechCredential(accessToken);
  // Keep the header set that previously worked in this project.
  const base = {
    "X-Api-Resource-Id": resourceId,
    "X-Api-Connect-Id": randomUUID(),
    "X-Api-Request-Id": randomUUID(),
    "X-Api-Sequence": "-1",
  };
  if (trimmedAppId && trimmedToken) {
    return {
      ...base,
      "X-Api-App-Key": trimmedAppId,
      "X-Api-Access-Key": trimmedToken,
    };
  }
  const apiKey = trimmedToken || trimmedAppId;
  if (!apiKey) throw new Error("Doubao speech credentials are missing");
  return { ...base, "X-Api-Key": apiKey };
}

export function isDoubaoSpeechConfigured(settings: SupervisorSettings): boolean {
  const appId = settings.doubaoSpeechAppId?.trim();
  const hasToken = Boolean(settings.doubaoSpeechAccessTokenEncrypted);
  if (appId && hasToken) return true;
  return hasToken && !appId;
}

export type SpeechRecognitionMode = "local" | "qwen" | "doubao";

/** Normalize legacy `browser` to `local`. */
export function resolveSpeechRecognitionMode(settings: SupervisorSettings): SpeechRecognitionMode {
  const mode = settings.speechRecognitionMode;
  if (mode === "qwen" || mode === "doubao" || mode === "local") return mode;
  return "local";
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
