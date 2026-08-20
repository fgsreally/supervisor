import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  AgentHarness,
  InMemorySessionRepo,
  type AgentTool,
  type AgentToolResult,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import { completeSimple, type AssistantMessage } from "@earendil-works/pi-ai";
import {
  createCodingTools,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadOnlyTools,
  SettingsManager,
  type ToolsOptions,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static, type TSchema } from "typebox";
import { Check } from "typebox/schema";
import { loadBuiltinAgentPrompt } from "../../agent/builtin/prompts.js";
import { getDb } from "../../db/db.js";
import { getSupervisorHome } from "../../utils/supervisor-home.js";
import { resolveLLMConfig } from "../../utils/model-utils.js";
import { isFeatureModelRef, readSupervisorSettings } from "../../utils/supervisor-settings.js";

export type WatsonTaskKind = string;

interface WatsonRunBase {
  kind: WatsonTaskKind;
  prompt: string;
  cwd?: string;
  systemPrompt?: string;
  injectSystem?: string;
  resultSchema?: TSchema;
  resultToolDescription?: string;
}

export interface WatsonSimpleOptions extends WatsonRunBase {
  mode: "simple";
}

export interface WatsonAgentOptions extends WatsonRunBase {
  mode: "agent";
  cwd: string;
  toolsPreset?: "coding" | "readonly" | "none";
  extraTools?: AgentTool[];
}

export type WatsonRunOptions = WatsonSimpleOptions | WatsonAgentOptions;

export interface WatsonRunResult<Result = never> {
  text: string;
  result: Result | null;
  agentId: number | null;
}

function watsonLogDir(): string {
  const dir = join(getSupervisorHome(), "logs", "watson");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function appendWatsonLog(line: string): void {
  appendFileSync(
    join(watsonLogDir(), "watson.log"),
    `${new Date().toISOString()} ${line}\n`,
    "utf8",
  );
}

export function readWatsonLogs(options?: { limit?: number }): string {
  const path = join(watsonLogDir(), "watson.log");
  if (!existsSync(path)) return "";
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - (options?.limit ?? 400))).join("\n");
}

export function listWatsonLogFiles(): string[] {
  const dir = watsonLogDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".log"))
    .sort();
}

function assistantMessageText(message: AssistantMessage | undefined): string {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();
}

function usageLog(message: AssistantMessage | undefined): string {
  const usage = message?.usage;
  if (!usage) return "";
  return ` input=${usage.input} output=${usage.output} cacheRead=${usage.cacheRead} cacheWrite=${usage.cacheWrite} totalTokens=${usage.totalTokens}`;
}

function createSubmitResultTool(
  capture: { value?: unknown },
  schema: TSchema,
  description?: string,
): AgentTool {
  return {
    name: "submit_result",
    label: "Submit Result",
    description:
      description ?? "Submit the final structured result. This must be the final tool call.",
    parameters: Type.Object({ result: schema }),
    async execute(_id, params): Promise<AgentToolResult<unknown>> {
      const result = (params as { result?: unknown }).result;
      if (!Check(schema, result)) throw new Error("Watson submit_result validation failed");
      capture.value = result;
      return {
        content: [{ type: "text", text: "Structured result submitted" }],
        details: result,
        terminate: true,
      };
    },
  };
}

function defaultWatsonSystemPrompt(kind: WatsonTaskKind, structured: boolean): string {
  return [
    loadBuiltinAgentPrompt("watson"),
    "",
    `Current task kind=${kind}`,
    structured
      ? "Finish by calling submit_result exactly once with the required result."
      : "Report the result concisely.",
  ].join("\n");
}

interface WatsonRunLogger {
  /** Append one timestamped trace line to this run's log file. Never throws. */
  trace(line: string): void;
  /** Append the final text/result sections (same format as before). */
  finish(text: string, result: unknown): void;
}

function createRunLogger(kind: string): WatsonRunLogger {
  const path = join(
    watsonLogDir(),
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${kind.replace(/[^\w.-]+/g, "_")}.log`,
  );
  const trace = (line: string): void => {
    try {
      appendFileSync(path, `${new Date().toISOString()} ${line}\n`, "utf8");
    } catch {
      // Logging must never break the run.
    }
  };
  return {
    trace,
    finish(text: string, result: unknown): void {
      try {
        appendFileSync(
          path,
          [
            "--- text ---",
            text,
            "--- result ---",
            result == null ? "(none)" : JSON.stringify(result, null, 2),
            "",
          ].join("\n"),
          "utf8",
        );
      } catch {
        // Logging must never break the run.
      }
    },
  };
}

function summarizeToolArgs(args: unknown, maxLength = 300): string {
  let text: string;
  try {
    text = JSON.stringify(args) ?? String(args);
  } catch {
    text = String(args);
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...(${text.length} chars)` : text;
}

function createWatsonTools(cwd: string, preset: WatsonAgentOptions["toolsPreset"]): AgentTool[] {
  const settings = SettingsManager.create(cwd);
  const options: ToolsOptions = {};
  const shellPath = settings.getShellPath();
  const commandPrefix = settings.getShellCommandPrefix();
  if (shellPath || commandPrefix) options.bash = { shellPath, commandPrefix };
  if (preset === "none") return [];
  if (preset === "readonly") return createReadOnlyTools(cwd, options);
  return [
    ...createCodingTools(cwd, options),
    createGrepTool(cwd, options.grep),
    createFindTool(cwd, options.find),
    createLsTool(cwd, options.ls),
  ];
}

export function runWatson<const Schema extends TSchema>(
  options: WatsonRunOptions & { resultSchema: Schema },
): Promise<WatsonRunResult<Static<Schema>>>;
export function runWatson(options: WatsonRunOptions): Promise<WatsonRunResult>;
export async function runWatson(options: WatsonRunOptions): Promise<WatsonRunResult<unknown>> {
  const db = getDb();
  const ref = readSupervisorSettings().featureModels?.assistant;
  if (!isFeatureModelRef(ref)) throw new Error("未配置助手模型，华生无法运行");
  const configuredModel = db.getModel(ref.providerId, ref.modelId);
  if (!configuredModel) throw new Error("助手模型不存在，华生无法运行");
  const llm = resolveLLMConfig(configuredModel.id);

  const structured = options.resultSchema !== undefined;
  const cwd = options.cwd?.trim() || process.cwd();
  const startedAt = Date.now();
  const runLog = createRunLogger(options.kind);
  const stats = { llmTurns: 0, toolCalls: 0 };
  appendWatsonLog(
    `[start] kind=${options.kind} mode=${options.mode} cwd=${cwd} model=${llm.model.provider}/${llm.model.id} structured=${structured}`,
  );
  runLog.trace(
    `[run:start] kind=${options.kind} mode=${options.mode} cwd=${cwd} model=${llm.model.provider}/${llm.model.id} structured=${structured}`,
  );

  try {
    let text = "";
    let result: unknown = null;
    let lastMessage: AssistantMessage | undefined;

    if (options.mode === "simple") {
      const capture: { value?: unknown } = {};
      const submitTool = options.resultSchema
        ? createSubmitResultTool(capture, options.resultSchema, options.resultToolDescription)
        : undefined;
      stats.llmTurns += 1;
      const llmStartedAt = Date.now();
      runLog.trace(`[llm:start] turn=1 model=${llm.model.provider}/${llm.model.id}`);
      const message = await completeSimple(
        llm.model,
        {
          systemPrompt: [
            options.systemPrompt ?? defaultWatsonSystemPrompt(options.kind, structured),
            options.injectSystem?.trim() ?? "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          messages: [{ role: "user", content: options.prompt, timestamp: Date.now() }],
          ...(submitTool ? { tools: [submitTool] } : {}),
        },
        { apiKey: llm.apiKey },
      );
      runLog.trace(
        `[llm:end] turn=1 durationMs=${Date.now() - llmStartedAt} stopReason=${message.stopReason}${usageLog(message)}`,
      );
      lastMessage = message;
      text = assistantMessageText(message);
      if (options.resultSchema) {
        const call = message.content.find(
          (part) => part.type === "toolCall" && part.name === "submit_result",
        );
        result = call?.type === "toolCall" ? (call.arguments as { result?: unknown }).result : null;
        if (result === null || !Check(options.resultSchema, result)) {
          throw new Error("华生未提交有效的结构化结果");
        }
      }
    } else {
      const capture: { value?: unknown } = {};
      const tools = [
        ...createWatsonTools(cwd, options.toolsPreset ?? "coding"),
        ...(options.extraTools ?? []),
        ...(options.resultSchema
          ? [createSubmitResultTool(capture, options.resultSchema, options.resultToolDescription)]
          : []),
      ];
      const systemPrompt = [
        options.systemPrompt ?? defaultWatsonSystemPrompt(options.kind, structured),
        options.injectSystem?.trim() ?? "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const repo = new InMemorySessionRepo();
      const session = await repo.create();
      const harness = new AgentHarness({
        env: new NodeExecutionEnv({ cwd }),
        session,
        model: llm.model,
        thinkingLevel: "off",
        systemPrompt,
        tools,
        getApiKeyAndHeaders: async () => ({
          apiKey: llm.apiKey,
        }),
      });
      // Timing trace only; must not alter harness behavior.
      const toolStartedAt = new Map<string, number>();
      let turnStartedAt = 0;
      harness.subscribe((event) => {
        switch (event.type) {
          case "turn_start":
            stats.llmTurns += 1;
            turnStartedAt = Date.now();
            runLog.trace(
              `[llm:start] turn=${stats.llmTurns} model=${llm.model.provider}/${llm.model.id}`,
            );
            break;
          case "message_end": {
            if (event.message.role !== "assistant") break;
            const assistant = event.message as AssistantMessage;
            runLog.trace(
              `[llm:end] turn=${stats.llmTurns} durationMs=${Date.now() - turnStartedAt} stopReason=${assistant.stopReason}${usageLog(assistant)}`,
            );
            break;
          }
          case "tool_execution_start":
            stats.toolCalls += 1;
            toolStartedAt.set(event.toolCallId, Date.now());
            runLog.trace(
              `[tool:start] name=${event.toolName} id=${event.toolCallId} args=${summarizeToolArgs(event.args)}`,
            );
            break;
          case "tool_execution_end": {
            const started = toolStartedAt.get(event.toolCallId);
            toolStartedAt.delete(event.toolCallId);
            runLog.trace(
              `[tool:end] name=${event.toolName} id=${event.toolCallId} durationMs=${started === undefined ? "unknown" : Date.now() - started} isError=${event.isError}`,
            );
            break;
          }
          default:
            break;
        }
      });
      const last = await harness.prompt(options.prompt);
      lastMessage = last;
      text = assistantMessageText(last);
      result = capture.value ?? null;
      if (options.resultSchema && result === null) {
        throw new Error("华生未调用 submit_result");
      }
    }

    appendWatsonLog(
      `[done] kind=${options.kind} mode=${options.mode} durationMs=${Date.now() - startedAt} llmTurns=${stats.llmTurns} toolCalls=${stats.toolCalls} chars=${text.length} hasResult=${result != null}${usageLog(lastMessage)}`,
    );
    runLog.trace(
      `[run:done] durationMs=${Date.now() - startedAt} llmTurns=${stats.llmTurns} toolCalls=${stats.toolCalls} chars=${text.length} hasResult=${result != null}${usageLog(lastMessage)}`,
    );
    runLog.finish(text, result);
    return { text, result, agentId: null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    appendWatsonLog(
      `[error] kind=${options.kind} mode=${options.mode} durationMs=${Date.now() - startedAt} ${message}`,
    );
    runLog.trace(
      `[run:error] durationMs=${Date.now() - startedAt} llmTurns=${stats.llmTurns} toolCalls=${stats.toolCalls} ${message}`,
    );
    throw error;
  }
}

export interface WatsonFacade {
  run: typeof runWatson;
}
