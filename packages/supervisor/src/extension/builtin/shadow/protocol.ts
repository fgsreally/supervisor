import { appendContextFilesToSystemPrompt } from "../../../core/resource/context-files.js";
import { loadBuiltinShadowResource } from "../../../agent/builtin/prompts.js";
import { Check } from "typebox/schema";
import type { ShadowProtocolResult } from "./types.js";
import { Type } from "typebox";

const commonProperties = {
  shadowMemory: Type.Optional(
    Type.Object({
      action: Type.Union([Type.Literal("append"), Type.Literal("replace")]),
      content: Type.String(),
    }),
  ),
  suggestedQuestions: Type.Optional(Type.Array(Type.String())),
  title: Type.Optional(Type.String()),
  commitMessage: Type.Optional(Type.String()),
};

const shadowResultOptions = { additionalProperties: false } as const;

export const ShadowResultSchema = Type.Union([
  Type.Object({ ...commonProperties, alert: Type.String() }, shadowResultOptions),
  Type.Object({ ...commonProperties, analysis: Type.String() }, shadowResultOptions),
  Type.Object(commonProperties, shadowResultOptions),
]);

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
export function normalizeShadowSubmitResult(rawInput: unknown): ShadowProtocolResult | null {
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
  if (!Check(ShadowResultSchema, raw)) return null;

  const record = raw as Record<string, unknown>;
  const memoryRaw = record.shadowMemory;
  let shadowMemory: ShadowProtocolResult["shadowMemory"];
  if (memoryRaw && typeof memoryRaw === "object" && !Array.isArray(memoryRaw)) {
    const memory = memoryRaw as Record<string, unknown>;
    const action = memory.action === "append" || memory.action === "replace" ? memory.action : null;
    const content = asNonEmptyString(memory.content);
    if (action && content) shadowMemory = { action, content };
  }

  return {
    shadowMemory,
    alert: asNonEmptyString(record.alert),
    analysis: asNonEmptyString(record.analysis),
    suggestedQuestions: asStringArray(record.suggestedQuestions, 4),
    title: asNonEmptyString(record.title),
    commitMessage: asNonEmptyString(record.commitMessage),
  };
}
