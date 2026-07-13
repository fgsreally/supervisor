/**
 * Resolved Hindsight runtime configuration.
 *
 * Precedence: built-in defaults, then `HINDSIGHT_*` environment variables.
 */

export type HindsightScoping = "global" | "per-project" | "per-project-tagged";

export interface HindsightConfig {
  hindsightApiUrl: string | null;
  hindsightApiToken: string | null;

  bankId: string | null;
  bankIdPrefix: string;
  scoping: HindsightScoping;
  bankMission: string;
  retainMission: string | null;

  autoRecall: boolean;
  autoRetain: boolean;
  localFallback: boolean;

  retainMode: "full-session" | "last-turn";
  retainEveryNTurns: number;
  retainOverlapTurns: number;
  retainContext: string;

  recallBudget: "low" | "mid" | "high";
  recallMaxTokens: number;
  recallTypes: string[];
  recallContextTurns: number;
  recallMaxQueryChars: number;
  recallPromptPreamble: string;

  debug: boolean;
}

const VALID_RETAIN_MODES: HindsightConfig["retainMode"][] = ["full-session", "last-turn"];
const VALID_BUDGETS: HindsightConfig["recallBudget"][] = ["low", "mid", "high"];
const VALID_SCOPINGS: HindsightScoping[] = ["global", "per-project", "per-project-tagged"];

const DEFAULT_PREAMBLE =
  "Relevant memories from past conversations (prioritize recent when conflicting). " +
  "Only use memories that are directly useful to continue this conversation; ignore the rest:";

function envBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return ["true", "1", "yes"].includes(value.toLowerCase());
}

function envInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function envString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function pickBudget(value: unknown): HindsightConfig["recallBudget"] | undefined {
  return typeof value === "string" && (VALID_BUDGETS as string[]).includes(value)
    ? (value as HindsightConfig["recallBudget"])
    : undefined;
}

function pickRetainMode(value: unknown): HindsightConfig["retainMode"] | undefined {
  return typeof value === "string" && (VALID_RETAIN_MODES as string[]).includes(value)
    ? (value as HindsightConfig["retainMode"])
    : undefined;
}

function pickScoping(value: unknown): HindsightScoping | undefined {
  return typeof value === "string" && (VALID_SCOPINGS as string[]).includes(value)
    ? (value as HindsightScoping)
    : undefined;
}

function parseRecallTypes(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadHindsightConfig(env: NodeJS.ProcessEnv = process.env): HindsightConfig {
  const apiUrlEnv = envString(env.HINDSIGHT_API_URL);
  const apiTokenEnv = envString(env.HINDSIGHT_API_TOKEN);
  const bankIdEnv = envString(env.HINDSIGHT_BANK_ID);
  const bankMissionEnv = envString(env.HINDSIGHT_BANK_MISSION);
  const retainModeEnv = pickRetainMode(env.HINDSIGHT_RETAIN_MODE);
  const recallBudgetEnv = pickBudget(env.HINDSIGHT_RECALL_BUDGET);
  const autoRecallEnv = envBool(env.HINDSIGHT_AUTO_RECALL);
  const autoRetainEnv = envBool(env.HINDSIGHT_AUTO_RETAIN);
  const localFallbackEnv = envBool(env.HINDSIGHT_LOCAL_FALLBACK);
  const scopingEnv = pickScoping(env.HINDSIGHT_SCOPING);
  const debugEnv = envBool(env.HINDSIGHT_DEBUG);
  const recallMaxTokensEnv = envInt(env.HINDSIGHT_RECALL_MAX_TOKENS);
  const recallContextTurnsEnv = envInt(env.HINDSIGHT_RECALL_CONTEXT_TURNS);
  const recallMaxQueryCharsEnv = envInt(env.HINDSIGHT_RECALL_MAX_QUERY_CHARS);
  const retainEveryNTurnsEnv = envInt(env.HINDSIGHT_RETAIN_EVERY_N_TURNS);
  const retainOverlapTurnsEnv = envInt(env.HINDSIGHT_RETAIN_OVERLAP_TURNS);

  return {
    hindsightApiUrl: apiUrlEnv ?? null,
    hindsightApiToken: apiTokenEnv ?? null,

    bankId: bankIdEnv ?? null,
    bankIdPrefix: envString(env.HINDSIGHT_BANK_ID_PREFIX) ?? "supervisor",
    scoping: scopingEnv ?? "per-project-tagged",
    bankMission: bankMissionEnv ?? "",
    retainMission: envString(env.HINDSIGHT_RETAIN_MISSION) ?? null,

    autoRecall: autoRecallEnv ?? true,
    autoRetain: autoRetainEnv ?? true,
    localFallback: localFallbackEnv ?? true,

    retainMode: retainModeEnv ?? "full-session",
    retainEveryNTurns: retainEveryNTurnsEnv ?? 3,
    retainOverlapTurns: retainOverlapTurnsEnv ?? 1,
    retainContext: envString(env.HINDSIGHT_RETAIN_CONTEXT) ?? "supervisor",

    recallBudget: recallBudgetEnv ?? "mid",
    recallMaxTokens: recallMaxTokensEnv ?? 2048,
    recallTypes: parseRecallTypes(env.HINDSIGHT_RECALL_TYPES),
    recallContextTurns: recallContextTurnsEnv ?? 3,
    recallMaxQueryChars: recallMaxQueryCharsEnv ?? 4000,
    recallPromptPreamble: DEFAULT_PREAMBLE,

    debug: debugEnv ?? false,
  };
}

export function isHindsightApiConfigured(
  config: HindsightConfig,
): config is HindsightConfig & { hindsightApiUrl: string } {
  return typeof config.hindsightApiUrl === "string" && config.hindsightApiUrl.length > 0;
}

export function resolveMemoryMode(config: HindsightConfig): "api" | "local" | "disabled" {
  if (isHindsightApiConfigured(config)) return "api";
  if (config.localFallback) return "local";
  return "disabled";
}
