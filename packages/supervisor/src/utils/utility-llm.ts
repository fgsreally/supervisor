import type { CompactionPreparation } from "@earendil-works/pi-agent-core";
import { compact } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { runWatson } from "../core/watson.js";
import type { LLMConfig } from "./model-utils.js";

export interface UtilityCompactionResult {
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: unknown;
}

export async function generateDailyWorkDigest(
  dayKey: string,
  sections: Array<{
    projectName: string;
    cwd: string;
    commits: Array<{ shortHash: string; subject: string }>;
  }>,
): Promise<string> {
  const body = sections
    .map((section) =>
      [
        `## ${section.projectName}`,
        `cwd: ${section.cwd}`,
        ...section.commits.map((commit) => `- ${commit.shortHash} ${commit.subject}`),
      ].join("\n"),
    )
    .join("\n\n");
  const run = await runWatson({
    mode: "simple",
    kind: "daily-work",
    resultSchema: Type.Object({ summary: Type.String() }),
    prompt: [
      `Summarize the git work completed on ${dayKey}.`,
      "Focus on accomplishments, group related commits, and do not invent anything.",
      "Submit the markdown summary through submit_result.",
      "",
      body.slice(0, 12000),
    ].join("\n"),
  });
  return run.result?.summary ?? "";
}

/** Compaction is a dedicated pi-agent-core capability and is not a Watson task. */
export async function compactWithUtilityModel(
  config: LLMConfig,
  preparation: CompactionPreparation,
  customInstructions?: string,
): Promise<UtilityCompactionResult> {
  return compact(
    preparation,
    config.model,
    config.apiKey,
    undefined,
    customInstructions,
    undefined,
    "off",
  ) as unknown as UtilityCompactionResult;
}
