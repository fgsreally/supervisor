import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  AgentHarness,
  InMemorySessionRepo,
  type AgentTool,
  type AgentToolResult,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { findPackagedAgentId } from "../agent/builtin/registry.js";
import { getAgentHomeDir } from "../agent/agent-paths.js";
import type { SupervisorDb } from "../db/db.js";
import { createDefaultTools } from "../utils/default-tools.js";
import { resolveAssistantModelAuth, type UtilityModelAuth } from "../utils/utility-llm.js";
import { loadPackagedAgentPrompt } from "../agent/builtin/prompts.js";

export type WatsonTaskKind = "project-parse" | "worktree-cleanup" | "internal" | (string & {});

export interface WatsonRunOptions {
  db: SupervisorDb;
  cwd: string;
  kind: WatsonTaskKind;
  /** Task-specific user prompt (临时注入). */
  prompt: string;
  /** Optional override; default loads 华生 system prompt + task hint. */
  systemPrompt?: string;
  /** Extra lines appended to the Watson system prompt. */
  injectSystem?: string;
  toolsPreset?: "coding" | "readonly" | "none";
  /** Extra tools. */
  extraTools?: AgentTool[];
  /**
   * When true, adds terminating `submit_result` tool (pi 官方结构化输出方式)
   * and requires the model to call it. No text/XML/JSON fallbacks.
   */
  structured?: boolean;
  auth?: UtilityModelAuth | null;
}

export interface WatsonRunResult<T = unknown> {
  text: string;
  /** Parsed structured payload from `submit_result` when requested. */
  result: T | null;
  agentId: number | null;
}

function watsonLogDir(agentId: number): string {
  const dir = join(getAgentHomeDir(agentId), "logs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function appendWatsonLog(agentId: number, line: string): void {
  const path = join(watsonLogDir(agentId), "watson.log");
  appendFileSync(path, `${new Date().toISOString()} ${line}\n`, "utf8");
}

export function readWatsonLogs(agentId: number, options?: { limit?: number }): string {
  const path = join(watsonLogDir(agentId), "watson.log");
  if (!existsSync(path)) return "";
  const text = readFileSync(path, "utf8");
  const limit = options?.limit ?? 400;
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - limit)).join("\n");
}

export function listWatsonLogFiles(agentId: number): string[] {
  const dir = watsonLogDir(agentId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".log"))
    .sort();
}

function assistantMessageText(message: AssistantMessage | undefined): string {
  if (!message) return "";
  const content = message.content as unknown;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if ((part as { type?: string }).type === "text") {
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * pi 官方结构化输出：终止型 tool（见 coding-agent examples/structured-output.ts）。
 * provider-level json_schema 未合入 pi-ai。
 */
function createSubmitResultTool(capture: { value?: unknown }): AgentTool {
  return {
    name: "submit_result",
    label: "Submit Result",
    description:
      "提交最终结构化结果。完成探索/改动后必须作为最后一步调用一次；调用后任务结束。",
    parameters: Type.Object({
      result: Type.Unknown({ description: "任务要求的 JSON 对象" }),
    }),
    async execute(_id, params): Promise<AgentToolResult<unknown>> {
      const result = (params as { result?: unknown }).result;
      capture.value = result;
      return {
        content: [{ type: "text", text: "已提交结构化结果" }],
        details: result,
        terminate: true,
      };
    },
  };
}

function defaultWatsonSystemPrompt(kind: WatsonTaskKind, structured: boolean): string {
  const base = loadPackagedAgentPrompt("watson");
  const parts = [
    base,
    "",
    `当前任务 kind=${kind}`,
    structured
      ? "完成后必须调用工具 submit_result（参数 result 为 JSON 对象）提交最终结果；不要只写在回复正文里。"
      : "用简洁文字汇报结果。",
  ];
  return parts.join("\n");
}

/**
 * 华生：Supervisor 内部 runner（AgentHarness + 简单工具 + 助手模型）。
 * 不创建用户 session；扩展可通过 ctx.watson.run 调用。
 */
export async function runWatsonTask<T = unknown>(
  options: WatsonRunOptions,
): Promise<WatsonRunResult<T>> {
  const agentId = findPackagedAgentId(options.db, "watson") ?? null;
  const auth = options.auth ?? (await resolveAssistantModelAuth(options.db));
  if (!auth) {
    throw new Error("未配置「助手模型」，华生无法运行");
  }

  const structured = options.structured === true;
  if (agentId != null) {
    appendWatsonLog(
      agentId,
      `[start] kind=${options.kind} cwd=${options.cwd} model=${auth.model.provider}/${auth.model.id} structured=${structured}`,
    );
  }

  const capture: { value?: unknown } = {};
  const baseTools = createDefaultTools(options.cwd, options.toolsPreset ?? "coding");
  const tools: AgentTool[] = [
    ...baseTools,
    ...(options.extraTools ?? []),
    ...(structured ? [createSubmitResultTool(capture)] : []),
  ];

  const systemPrompt = [
    options.systemPrompt ?? defaultWatsonSystemPrompt(options.kind, structured),
    options.injectSystem?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const repo = new InMemorySessionRepo();
  const session = await repo.create();
  const env = new NodeExecutionEnv({ cwd: options.cwd });
  const harness = new AgentHarness({
    env,
    session,
    model: auth.model,
    thinkingLevel: "off",
    systemPrompt,
    tools,
    getApiKeyAndHeaders: async () => ({
      apiKey: auth.apiKey,
      ...(auth.headers ? { headers: auth.headers } : {}),
    }),
  });

  try {
    const last = await harness.prompt(options.prompt);
    const text = assistantMessageText(last);
    const result = capture.value !== undefined ? (capture.value as T) : null;

    if (structured && result === null) {
      throw new Error("华生未调用 submit_result，无法得到结构化结果");
    }

    if (agentId != null) {
      appendWatsonLog(
        agentId,
        `[done] kind=${options.kind} chars=${text.length} hasResult=${result != null}`,
      );
      const runPath = join(
        watsonLogDir(agentId),
        `${new Date().toISOString().replace(/[:.]/g, "-")}-${String(options.kind).replace(/[^\w.-]+/g, "_")}.log`,
      );
      const body = [
        "--- text ---",
        text,
        "--- result ---",
        result != null ? JSON.stringify(result, null, 2) : "(none)",
        "",
      ].join("\n");
      appendFileSync(runPath, body, "utf8");
    }

    return { text, result, agentId };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (agentId != null) {
      appendWatsonLog(agentId, `[error] kind=${options.kind} ${message}`);
    }
    throw error;
  }
}

/** Extension / manager facade. */
export interface WatsonFacade {
  run<T = unknown>(
    options: Omit<WatsonRunOptions, "db"> & { cwd?: string },
  ): Promise<WatsonRunResult<T>>;
}
