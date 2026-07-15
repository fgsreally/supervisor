import type { AgentHarnessEvent, AgentMessage } from "@earendil-works/pi-agent-core";

export interface AiTestModelConfig {
  provider: string;
  name: string;
  apiType: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  contextWindow: number;
  maxTokens: number;
}

export interface AiTestEnvironmentOptions {
  cwd?: string;
  fixture?: string;
  extensions?: string[];
  artifactsDir?: string;
  subject?: Partial<AiTestModelConfig>;
}

export interface AiScenarioInput {
  name?: string;
  prompt: string;
  systemPrompt?: string;
  toolsPreset?: "coding" | "readonly" | "none";
}

export interface AiToolCall {
  type: "start" | "end";
  name: string;
  args?: unknown;
  result?: unknown;
}

export interface AiScenarioResult {
  name: string;
  prompt: string;
  cwd: string;
  messages: AgentMessage[];
  events: AgentHarnessEvent[];
  toolCalls: AiToolCall[];
  finalText: string;
  durationMs: number;
  artifactDir?: string;
}

export interface AiJudgeInput {
  task: string;
  criteria: string[];
  result: AiScenarioResult;
  passScore?: 0 | 1 | 2 | 3 | 4;
  judge?: Partial<AiTestModelConfig>;
}

export interface AiJudgeResult {
  verdict: "pass" | "fail" | "invalid";
  score: 0 | 1 | 2 | 3 | 4;
  reasons: string[];
  evidence: string[];
  raw: string;
}

export interface AiComparisonInput {
  task: string;
  criteria: string[];
  baseline: AiScenarioResult;
  candidate: AiScenarioResult;
  judge?: Partial<AiTestModelConfig>;
}

export interface AiComparisonResult {
  winner: "baseline" | "candidate" | "tie" | "invalid";
  baselineScore: 0 | 1 | 2 | 3 | 4;
  candidateScore: 0 | 1 | 2 | 3 | 4;
  reasons: string[];
  evidence: string[];
  raw: string;
}

export interface AiTestEnvironment {
  readonly root: string;
  readonly cwd: string;
  run(input: AiScenarioInput): Promise<AiScenarioResult>;
  cleanup(): void;
}
