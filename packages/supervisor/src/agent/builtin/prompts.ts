import type { PackagedAgentPromptKind } from "./registry.js";

import assistantPrompt from "../../../resource/agents/assistant.md";
import codingPrompt from "../../../resource/agents/coding.md";
import introPrompt from "../../../resource/agents/intro.md";
import smartRouterPrompt from "../../../resource/agents/smart-router.md";
import watsonPrompt from "../../../resource/agents/watson.md";
import shadowRun from "../../../resource/shadow/run.md";
import shadowSubmitResult from "../../../resource/shadow/submit-result.md";
import shadowSystem from "../../../resource/shadow/system.md";

type BuiltinAgentPromptKind = PackagedAgentPromptKind | "assistant" | "watson";

const AGENT_PROMPTS: Record<BuiltinAgentPromptKind, string> = {
  assistant: assistantPrompt,
  coding: codingPrompt,
  intro: introPrompt,
  "smart-router": smartRouterPrompt,
  watson: watsonPrompt,
};

const SHADOW_RESOURCES: Record<string, string> = {
  "run.md": shadowRun,
  "submit-result.md": shadowSubmitResult,
  "system.md": shadowSystem,
};

export function loadBuiltinAgentPrompt(kind: BuiltinAgentPromptKind): string {
  const prompt = AGENT_PROMPTS[kind];
  if (prompt === undefined) throw new Error(`Missing packaged agent prompt: ${kind}.md`);
  return prompt.trim();
}

export function loadBuiltinShadowResource(name: string): string {
  const resource = SHADOW_RESOURCES[name];
  if (resource === undefined) throw new Error(`Missing packaged Shadow resource: ${name}`);
  return resource.trim();
}

export function loadPackagedAgentPrompt(kind: PackagedAgentPromptKind): string {
  return loadBuiltinAgentPrompt(kind);
}

/** @deprecated use loadPackagedAgentPrompt */
export const loadInternalAgentPrompt = loadPackagedAgentPrompt;
