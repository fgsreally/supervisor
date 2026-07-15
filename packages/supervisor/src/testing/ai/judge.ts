import {
  completeSimple,
  getModel,
  type Api,
  type KnownProvider,
  type Model,
} from "@earendil-works/pi-ai";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAiJudgeConfig } from "./config.js";
import type {
  AiComparisonInput,
  AiComparisonResult,
  AiJudgeInput,
  AiJudgeResult,
  AiScenarioResult,
  AiTestModelConfig,
} from "./types.js";

function configuredModel(config: AiTestModelConfig): Model<Api> {
  const base = getModel(config.apiType as KnownProvider, config.model as never);
  if (!base) throw new Error(`AI judge model not found: ${config.apiType}/${config.model}`);
  return {
    ...base,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config.apiType !== base.api ? { api: config.apiType as never } : {}),
  };
}

function responseText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        Boolean(part) && typeof part === "object" && part.type === "text" && !!part.text,
    )
    .map((part) => part.text)
    .join("")
    .trim();
}

function jsonCandidate(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? raw;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  return start >= 0 && end > start ? source.slice(start, end + 1) : source.trim();
}

function score(value: unknown): 0 | 1 | 2 | 3 | 4 | null {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 4
    ? (value as 0 | 1 | 2 | 3 | 4)
    : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function parseAiJudgeResult(raw: string, passScore = 3): AiJudgeResult {
  try {
    const parsed = JSON.parse(jsonCandidate(raw)) as Record<string, unknown>;
    const parsedScore = score(parsed.score);
    if (parsedScore === null) throw new Error("invalid score");
    return {
      verdict: parsedScore >= passScore ? "pass" : "fail",
      score: parsedScore,
      reasons: strings(parsed.reasons),
      evidence: strings(parsed.evidence),
      raw,
    };
  } catch {
    return { verdict: "invalid", score: 0, reasons: ["Invalid judge response"], evidence: [], raw };
  }
}

function summarize(result: AiScenarioResult): Record<string, unknown> {
  return {
    finalAnswer: result.finalText.slice(0, 12_000),
    toolCalls: result.toolCalls.slice(0, 100),
    messages: result.messages.slice(-20),
    durationMs: result.durationMs,
  };
}

async function completeJudge(config: AiTestModelConfig, prompt: string): Promise<string> {
  if (!config.apiKey) throw new Error("AI judge credentials are missing");
  const result = await completeSimple(
    configuredModel(config),
    {
      systemPrompt:
        "You are an impartial evaluator of coding-agent behavior. Use only the supplied evidence.",
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    },
    { apiKey: config.apiKey, reasoning: "off", timeoutMs: 120_000 },
  );
  return responseText(result.content);
}

export async function judgeAiResult(input: AiJudgeInput): Promise<AiJudgeResult> {
  const passScore = input.passScore ?? 3;
  const prompt = [
    "Evaluate the coding-agent result against the task and every criterion.",
    "Score from 0 to 4: 0=no meaningful progress, 1=major failure, 2=partial, 3=mostly correct, 4=fully correct.",
    'Return JSON only: {"score":0,"reasons":["..."],"evidence":["..."]}.',
    `Task: ${input.task}`,
    `Criteria:\n${input.criteria.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
    `Result:\n${JSON.stringify(summarize(input.result), null, 2)}`,
  ].join("\n\n");
  const config = readAiJudgeConfig(input.judge);
  let raw = await completeJudge(config, prompt);
  let parsed = parseAiJudgeResult(raw, passScore);
  if (parsed.verdict === "invalid") {
    raw = await completeJudge(
      config,
      `${prompt}\n\nYour previous response was invalid. Return exactly one valid JSON object.`,
    );
    parsed = parseAiJudgeResult(raw, passScore);
  }
  if (input.result.artifactDir) {
    writeFileSync(
      join(input.result.artifactDir, "judge-result.json"),
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(join(input.result.artifactDir, "judge-raw.txt"), `${parsed.raw}\n`, "utf8");
  }
  return parsed;
}

export function parseAiComparisonResult(raw: string): AiComparisonResult {
  try {
    const parsed = JSON.parse(jsonCandidate(raw)) as Record<string, unknown>;
    const baselineScore = score(parsed.baselineScore);
    const candidateScore = score(parsed.candidateScore);
    const winner = parsed.winner;
    if (
      baselineScore === null ||
      candidateScore === null ||
      (winner !== "baseline" && winner !== "candidate" && winner !== "tie")
    ) {
      throw new Error("invalid comparison");
    }
    return {
      winner,
      baselineScore,
      candidateScore,
      reasons: strings(parsed.reasons),
      evidence: strings(parsed.evidence),
      raw,
    };
  } catch {
    return {
      winner: "invalid",
      baselineScore: 0,
      candidateScore: 0,
      reasons: ["Invalid judge response"],
      evidence: [],
      raw,
    };
  }
}

export async function compareAiResults(input: AiComparisonInput): Promise<AiComparisonResult> {
  const prompt = [
    "Blindly compare two coding-agent results. A is baseline and B is candidate; do not favor either label.",
    'Return JSON only: {"winner":"baseline|candidate|tie","baselineScore":0,"candidateScore":0,"reasons":["..."],"evidence":["..."]}.',
    `Task: ${input.task}`,
    `Criteria:\n${input.criteria.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
    `Result A:\n${JSON.stringify(summarize(input.baseline), null, 2)}`,
    `Result B:\n${JSON.stringify(summarize(input.candidate), null, 2)}`,
  ].join("\n\n");
  const config = readAiJudgeConfig(input.judge);
  let raw = await completeJudge(config, prompt);
  let parsed = parseAiComparisonResult(raw);
  if (parsed.winner === "invalid") {
    raw = await completeJudge(
      config,
      `${prompt}\n\nYour previous response was invalid. Return exactly one valid JSON object.`,
    );
    parsed = parseAiComparisonResult(raw);
  }
  return parsed;
}
