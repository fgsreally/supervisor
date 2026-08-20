import { appendContextFilesToSystemPrompt } from "../../../core/resource/context-files.js";
import { loadBuiltinShadowResource } from "../../../agent/builtin/prompts.js";
import { Check } from "typebox/schema";
import type { ShadowProtocolResult } from "./types.js";
import type { ShadowMessageLevel } from "./types.js";
import type { TSchema } from "typebox";
import { Type } from "typebox";

const standardInfoProperties = {
  shadowMemory: Type.Optional(
    Type.Object({
      action: Type.Union([Type.Literal("append"), Type.Literal("replace")]),
      content: Type.String(),
    }),
  ),
  suggestedQuestions: Type.Optional(Type.Array(Type.String())),
  title: Type.Optional(Type.String()),
};

const shadowResultOptions = { additionalProperties: false } as const;
const shadowMessageProperties = {
  message: Type.String(),
};

export function createShadowResultSchema(
  extensionProperties: Record<string, TSchema> = {},
): TSchema {
  return Type.Union([
    Type.Object({}, shadowResultOptions),
    Type.Object(
      {
        ...shadowMessageProperties,
        level: Type.Union([Type.Literal("error"), Type.Literal("warning")]),
      },
      shadowResultOptions,
    ),
    Type.Object(
      {
        ...standardInfoProperties,
        ...extensionProperties,
        ...shadowMessageProperties,
        level: Type.Literal("info"),
      },
      shadowResultOptions,
    ),
  ]);
}

export const ShadowResultSchema = createShadowResultSchema();

export function getShadowSubmitResultDescription(): string {
  return loadBuiltinShadowResource("submit-result.md");
}

export function getShadowSystemPrompt(cwd?: string): string {
  const prompt = loadBuiltinShadowResource("system.md");
  return cwd ? appendContextFilesToSystemPrompt(prompt, cwd) : prompt;
}

export function formatShadowRunPrompt(shadowMemory: string, latestTurn: string): string {
  return loadBuiltinShadowResource("run.md")
    .replaceAll("{{shadowMemory}}", shadowMemory.trim() || "(empty)")
    .replaceAll("{{latestTurn}}", latestTurn.trim() || "(empty)");
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asStringArray(value: unknown, limit: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => asNonEmptyString(item)?.replace(/\s+/g, " "))
    .filter((item): item is string => Boolean(item))
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, limit);
  return items.length > 0 ? items : undefined;
}

/** Normalize and validate the Watson submit_result payload into Shadow fields. */
export function normalizeShadowSubmitResult(
  rawInput: unknown,
  schema: TSchema = ShadowResultSchema,
  extensionKeys: string[] = [],
): ShadowProtocolResult | null {
  let raw = rawInput;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      raw = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  if (raw == null) return {};
  if (!Check(schema, raw)) return null;

  const record = raw as Record<string, unknown>;
  const memoryRaw = record.shadowMemory;
  let shadowMemory: ShadowProtocolResult["shadowMemory"];
  if (memoryRaw && typeof memoryRaw === "object" && !Array.isArray(memoryRaw)) {
    const memory = memoryRaw as Record<string, unknown>;
    const action = memory.action === "append" || memory.action === "replace" ? memory.action : null;
    const content = asNonEmptyString(memory.content);
    if (action && content) shadowMemory = { action, content };
  }

  const level = isShadowMessageLevel(record.level) ? record.level : undefined;
  return {
    shadowMemory,
    message: asNonEmptyString(record.message),
    level,
    suggestedQuestions: asStringArray(record.suggestedQuestions, 4),
    title: asNonEmptyString(record.title),
    extensions:
      level === "info"
        ? Object.fromEntries(
            extensionKeys
              .filter((key) => Object.hasOwn(record, key))
              .map((key) => [key, record[key]]),
          )
        : undefined,
  };
}

function isShadowMessageLevel(value: unknown): value is ShadowMessageLevel {
  return value === "error" || value === "warning" || value === "info";
}
