import { computed, ref } from "vue";
import { getLocale } from "@/i18n";
import type { Project, Session } from "@/api";
import type { ChatEntry } from "@/types/chat-entry";
import type { UISession } from "@/types/ui";
import shadowInteraction from "./scenarios/shadow-interaction.json";
import agentStreaming from "./scenarios/agent-streaming.json";
import pluginSurfaces from "./scenarios/plugin-surfaces.json";
import sessionStates from "./scenarios/session-states.json";
import workflowRun from "./scenarios/workflow-run.json";
import inputPasteText from "./scenarios/input-paste-text.json";
import composerStack from "./scenarios/composer-stack.json";

export interface LocalizedText {
  "zh-CN": string;
  en: string;
}

export interface ExampleBranch {
  id: string;
  label: LocalizedText;
  assistant: LocalizedText;
  thinking?: LocalizedText;
  entries?: ExampleEntrySpec[];
  stage?: string;
  shadow?: { level: "error" | "warning" | "info"; message: LocalizedText };
  suggestions?: LocalizedText[];
  tool?: ExampleTool;
  tools?: ExampleTool[];
}

export interface ExampleTool {
  name: string;
  arguments?: Record<string, unknown>;
  result: LocalizedText;
  isError?: boolean;
}

export type ExampleEntrySpec =
  | {
      type: "notice";
      content: LocalizedText;
      level?: "error" | "warning" | "info";
    }
  | {
      type: "llm_error";
      content: LocalizedText;
    }
  | {
      type: "compaction";
      summary: LocalizedText;
      firstKeptEntryId: string;
      tokensBefore: number;
      reason?: "threshold" | "manual" | "overflow";
      details?: { readFiles?: string[]; modifiedFiles?: string[] };
    };

export interface ExampleScenario {
  id: string;
  project: { id: string; title: LocalizedText; description: LocalizedText };
  session: { id: string; title: LocalizedText; description: LocalizedText; stage?: string };
  composer?: {
    changedFiles?: Array<{ path: string; status: "added" | "modified" | "deleted" }>;
    suggestions?: LocalizedText[];
    queuedInputs?: Array<{ id: string; message: LocalizedText; level: number }>;
    pendingUpdate?: {
      sourceSessionId: number;
      sourceTitle: LocalizedText;
      branch: string;
      files: Array<{ path: string; status: "added" | "modified" | "deleted" }>;
    };
  };
  rounds: Array<{ branches: ExampleBranch[] }>;
}

export interface ResolvedExampleBranch {
  id: string;
  label: string;
  assistant: string;
  thinking?: string;
  entries?: ChatEntry[];
  stage?: string;
  shadow?: { level: "error" | "warning" | "info"; message: string };
  suggestions?: string[];
  tools?: Array<{
    name: string;
    arguments?: Record<string, unknown>;
    result: string;
    isError?: boolean;
  }>;
}

const scenarios = [
  shadowInteraction,
  agentStreaming,
  pluginSurfaces,
  sessionStates,
  workflowRun,
  inputPasteText,
  composerStack,
] as unknown as ExampleScenario[];
const locale = computed<keyof LocalizedText>(() => (getLocale() === "en" ? "en" : "zh-CN"));

export const showExamples = ref(import.meta.env.DEV);

function text(value: LocalizedText): string {
  return value[locale.value] ?? value.en;
}

function scenarioSessionId(scenario: ExampleScenario): string {
  return `example:${scenario.project.id}:${scenario.session.id}`;
}

export function exampleProjects(): Project[] {
  return [
    {
      id: "example:examples",
      name: text({ "zh-CN": "示例", en: "Examples" }),
      description: text({ "zh-CN": "界面与能力示例", en: "Interface and capability examples" }),
      cwd: "",
      homeDir: "",
      meta: { example: true },
      parsedAt: null,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    },
  ];
}

export function exampleSessions(): UISession[] {
  return scenarios.map((scenario) => ({
    id: scenarioSessionId(scenario),
    workspaceId: "example:examples",
    parentId: null,
    creationMethod: "user",
    showInSessionList: true,
    agentId: null,
    status: "idle",
    createdAt: "2020-01-01T00:00:00.000Z",
    lastActiveAt: "2020-01-01T00:00:00.000Z",
    lastMessageAt: "2020-01-01T00:00:00.000Z",
    title: text(scenario.session.title),
    stage: scenario.session.stage ?? null,
    isBuiltin: false,
    meta: { example: true, description: text(scenario.session.description) },
    lastMessagePreview: text(scenario.session.description),
  }));
}

export function isExampleSession(id: string): boolean {
  return id.startsWith("example:");
}

export function getExampleSession(id: string): ExampleScenario | null {
  return scenarios.find((scenario) => scenarioSessionId(scenario) === id) ?? null;
}

function getRound(id: string, roundIndex = 0) {
  const scenario = getExampleSession(id);
  if (!scenario) return null;
  return scenario.rounds[Math.min(roundIndex, scenario.rounds.length - 1)] ?? null;
}

export function getExampleBranches(
  id: string,
  roundIndex = 0,
): Array<{ id: string; label: string }> {
  return (
    getRound(id, roundIndex)?.branches.map((branch) => ({
      id: branch.id,
      label: text(branch.label),
    })) ?? []
  );
}

export function getExampleBranch(
  id: string,
  branchId: string,
  roundIndex = 0,
): ResolvedExampleBranch | null {
  const branch =
    getRound(id, roundIndex)?.branches.find((item) => item.id === branchId) ??
    getRound(id, roundIndex)?.branches[0];
  if (!branch) return null;
  return {
    id: branch.id,
    label: text(branch.label),
    assistant: text(branch.assistant),
    thinking: branch.thinking ? text(branch.thinking) : undefined,
    stage: branch.stage,
    entries: branch.entries?.map((entry, index) => {
      const entryId = `${id}:entry:${roundIndex}:${branch.id}:${index}`;
      if (entry.type === "notice") {
        return {
          id: entryId,
          type: "notice",
          content: text(entry.content),
          level: entry.level,
          createdAt: Date.now(),
        } satisfies ChatEntry;
      }
      if (entry.type === "llm_error") {
        return {
          id: entryId,
          type: "llm_error",
          content: text(entry.content),
          createdAt: Date.now(),
        } satisfies ChatEntry;
      }
      return {
        id: entryId,
        type: "compaction",
        summary: text(entry.summary),
        firstKeptEntryId: entry.firstKeptEntryId,
        tokensBefore: entry.tokensBefore,
        reason: entry.reason,
        details: entry.details,
        createdAt: Date.now(),
      } satisfies ChatEntry;
    }),
    shadow: branch.shadow
      ? { level: branch.shadow.level, message: text(branch.shadow.message) }
      : undefined,
    suggestions: branch.suggestions?.map(text),
    tools: (branch.tools ?? (branch.tool ? [branch.tool] : [])).map((tool) => ({
      name: tool.name,
      arguments: tool.arguments,
      result: text(tool.result),
      isError: tool.isError,
    })),
  };
}

export function getExampleSessionProps(id: string): Session | null {
  const scenario = getExampleSession(id);
  if (!scenario) return null;
  return {
    id,
    projectId: "example:examples",
    parentId: null,
    status: "idle",
    cwd: "",
    leafId: null,
    agentId: null,
    spawnType: null,
    creationMethod: "user",
    showInSessionList: true,
    createdAt: "2020-01-01T00:00:00.000Z",
    lastActiveAt: "2020-01-01T00:00:00.000Z",
    title: text(scenario.session.title),
    isBuiltin: false,
    stage: scenario.session.stage ?? null,
    shadowEnabled: true,
    meta: {
      example: true,
      shadow: { running: false },
      changedFiles: scenario.composer?.changedFiles ?? [],
      ...(scenario.composer?.pendingUpdate
        ? {
            git: {
              pendingUpdate: {
                ...scenario.composer.pendingUpdate,
                sourceTitle: text(scenario.composer.pendingUpdate.sourceTitle),
                markedAt: Date.now(),
              },
            },
          }
        : {}),
    },
    currentTask: null,
    lastMessagePreview: text(scenario.session.description),
  };
}

export function getExampleComposerState(id: string) {
  const composer = getExampleSession(id)?.composer;
  return {
    suggestions: composer?.suggestions?.map(text) ?? [],
    queuedInputs:
      composer?.queuedInputs?.map((input) => ({
        id: input.id,
        message: text(input.message),
        level: input.level,
        source: "example",
        enqueuedAt: Date.now(),
      })) ?? [],
  };
}

export function exampleInitialEntries(_id: string): ChatEntry[] {
  return [];
}
