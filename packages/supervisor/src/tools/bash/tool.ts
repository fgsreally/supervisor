import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import {
  getBackgroundBashSession,
  listBackgroundBashSessions,
  startBackgroundBashSession,
  stopBackgroundBashSessions,
  waitBackgroundBashSession,
  writeBackgroundBashSession,
  type BashJobHost,
} from "./background.js";
import { detectListenPort } from "../../utils/listen-port.js";

const DEFAULT_TIMEOUT_S = 60;
const MAX_TIMEOUT_S = 5 * 60;
const DEFAULT_BACKGROUND_TIMEOUT_S = 10 * 60;
const MAX_BACKGROUND_TIMEOUT_S = 24 * 60 * 60;

const FOREVER_SERVER_COMMAND =
  /\b(pnpm|npm|yarn|bunx?|npx|vite|next|nuxt|astro|webpack(?:-dev-server)?|turbo)\b[\s\S]*\b(dev|start|serve|preview|watch)\b/i;

const bashSchema = Type.Object({
  command: Type.Optional(
    Type.String({
      description: "Shell command to execute (required unless action=list/wait/read/stop).",
    }),
  ),
  intent: Type.String({
    description: "One-line summary of why you run this command / manage this task (required).",
  }),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory. Defaults to the session cwd. Prefer this over `cd && …`.",
    }),
  ),
  timeout: Type.Optional(
    Type.Number({
      description: `Timeout in seconds. Foreground default ${DEFAULT_TIMEOUT_S}s (max ${MAX_TIMEOUT_S}s). Background default ${DEFAULT_BACKGROUND_TIMEOUT_S}s (max ${MAX_BACKGROUND_TIMEOUT_S}s); ignored when disable_timeout=true.`,
    }),
  ),
  run_in_background: Type.Optional(
    Type.Boolean({
      description:
        "If true, start as a background task and return task_id immediately (kimi-style). Use for long builds/tests/watchers. Not for project Vite/API servers.",
    }),
  ),
  disable_timeout: Type.Optional(
    Type.Boolean({
      description:
        "Background only: do not apply a timeout. Project Vite/API servers must use UpdateService, not bash.",
    }),
  ),
  description: Type.Optional(
    Type.String({
      description: "Short label for a background task. Defaults to intent when omitted.",
    }),
  ),
  action: Type.Optional(
    Type.Union([
      Type.Literal("wait"),
      Type.Literal("read"),
      Type.Literal("list"),
      Type.Literal("stop"),
      Type.Literal("write"),
    ]),
  ),
  task_id: Type.Optional(
    Type.String({
      description: "Background task id from run_in_background (for wait/read/stop/write).",
    }),
  ),
  pattern: Type.Optional(
    Type.String({
      description:
        "wait only: regex for ready output (default matches localhost URL / Vite ready).",
    }),
  ),
  input: Type.Optional(
    Type.String({ description: "write only: stdin text for a background task." }),
  ),
  timeout_ms: Type.Optional(
    Type.Number({
      minimum: 500,
      maximum: 300_000,
      description: "wait only: max milliseconds to block (default 90000).",
    }),
  ),
});

export type SupervisorBashParams = Static<typeof bashSchema>;

export interface SupervisorBashOptions {
  cwd: string;
  sessionId?: number;
  jobs?: BashJobHost;
  shellPath?: string;
  commandPrefix?: string;
  getEnv?: () => NodeJS.ProcessEnv;
}

const BASH_DESCRIPTION = [
  "Execute a shell command (replaces the default pi bash).",
  "",
  "Foreground (default): short commands only. Returns stdout/stderr when finished.",
  "Background: set run_in_background=true (+ description/intent). Returns task_id immediately.",
  "  - Prefer background for long builds, tests, or watchers.",
  "  - Project Vite/API hosting: do not start via bash. Call UpdateService (action=add|delete|update).",
  "  - After background start: do NOT tight-loop read; use action=wait once if you need ready output.",
  "Manage tasks: action=list | wait|read|stop|write with task_id.",
  "",
  "`intent` is always required. `eval` is JS/Python only — not a shell.",
].join("\n");

function textResult(text: string, details?: unknown): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details };
}

function assertIntent(intent: string | undefined): string {
  const value = intent?.trim() ?? "";
  if (!value) {
    throw new Error(
      "bash tool requires a non-empty `intent` field describing why you are running this command.",
    );
  }
  return value;
}

function requireJobs(options: SupervisorBashOptions): { sessionId: number; jobs: BashJobHost } {
  if (options.sessionId == null || !options.jobs) {
    throw new Error(
      "Background bash requires a session job host. Use foreground bash, or open a Session-bound agent.",
    );
  }
  return { sessionId: options.sessionId, jobs: options.jobs };
}

function clampTimeoutS(
  timeout: number | undefined,
  background: boolean,
  disableTimeout: boolean,
): number | undefined {
  if (background && disableTimeout) return undefined;
  const fallback = background ? DEFAULT_BACKGROUND_TIMEOUT_S : DEFAULT_TIMEOUT_S;
  const cap = background ? MAX_BACKGROUND_TIMEOUT_S : MAX_TIMEOUT_S;
  const seconds = timeout ?? fallback;
  return Math.min(Math.max(1, Math.floor(seconds)), cap);
}

async function runForeground(
  options: SupervisorBashOptions,
  params: SupervisorBashParams,
  signal?: AbortSignal,
): Promise<AgentToolResult<unknown>> {
  const command = params.command?.trim() ?? "";
  if (!command) throw new Error("bash foreground requires `command`");
  if (FOREVER_SERVER_COMMAND.test(command)) {
    throw new Error(
      "Do not start project Vite/API servers via bash. Call UpdateService (action=add).",
    );
  }

  const timeoutS = clampTimeoutS(params.timeout, false, false)!;
  const cwd = params.cwd?.trim() || options.cwd;
  const prefix = options.commandPrefix?.trim();
  const fullCommand = prefix ? `${prefix}\n${command}` : command;
  const ops = createLocalBashOperations({ shellPath: options.shellPath });
  let output = "";
  const env = { ...process.env, ...options.getEnv?.() };

  try {
    const result = await ops.exec(fullCommand, cwd, {
      signal,
      timeout: timeoutS,
      env,
      onData: (chunk) => {
        output += chunk.toString();
        if (output.length > 200_000) output = output.slice(-160_000);
      },
    });
    const text = output.trimEnd();
    if (result.exitCode !== 0 && result.exitCode !== null) {
      throw new Error(`${text ? `${text}\n\n` : ""}Command exited with code ${result.exitCode}`);
    }
    return textResult(text || "(no output)", { exitCode: result.exitCode });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "aborted") {
      throw new Error(`${output.trimEnd() ? `${output.trimEnd()}\n\n` : ""}Command aborted`);
    }
    if (error instanceof Error && error.message.startsWith("timeout:")) {
      const secs = error.message.split(":")[1] ?? String(timeoutS);
      throw new Error(
        `${output.trimEnd() ? `${output.trimEnd()}\n\n` : ""}Command timed out after ${secs} seconds`,
      );
    }
    throw error;
  }
}

async function runBackground(
  options: SupervisorBashOptions,
  params: SupervisorBashParams,
): Promise<AgentToolResult<unknown>> {
  const { sessionId, jobs } = requireJobs(options);
  const command = params.command?.trim() ?? "";
  if (!command) throw new Error("bash run_in_background requires `command`");
  if (FOREVER_SERVER_COMMAND.test(command)) {
    throw new Error(
      "Do not start project Vite/API servers via bash. Call UpdateService (action=add).",
    );
  }
  const intent = assertIntent(params.intent);
  const label = params.description?.trim() || intent;
  const cwd = params.cwd?.trim() || options.cwd;
  const item = await startBackgroundBashSession({
    sessionId,
    cwd,
    jobs,
    command,
    label,
    env: options.getEnv?.(),
  });

  const disableTimeout = params.disable_timeout === true;
  const timeoutS = clampTimeoutS(params.timeout, true, disableTimeout);
  if (timeoutS != null) {
    const jobId = item.id;
    setTimeout(() => {
      void jobs.cancel(jobId).catch(() => undefined);
    }, timeoutS * 1000).unref?.();
  }

  return textResult(
    [
      `task_id: ${item.id}`,
      `pid: ${item.pid ?? ""}`,
      `description: ${label}`,
      `status: ${item.status}`,
      `timeout: ${disableTimeout ? "disabled" : `${timeoutS}s`}`,
      "next_step: Background task started — use action=wait once if you need ready output; do NOT poll read.",
    ].join("\n"),
    item,
  );
}

export function createSupervisorBashTool(
  options: SupervisorBashOptions,
): AgentTool<typeof bashSchema> {
  return {
    name: "bash",
    label: "bash",
    description: BASH_DESCRIPTION,
    parameters: bashSchema,
    async execute(_toolCallId, params, signal): Promise<AgentToolResult<unknown>> {
      assertIntent(params.intent);
      const action = params.action;

      if (action === "list") {
        const { sessionId, jobs } = requireJobs(options);
        const items = await listBackgroundBashSessions(sessionId, jobs);
        return textResult(JSON.stringify(items, null, 2), { items });
      }

      if (action === "wait" || action === "read" || action === "stop" || action === "write") {
        const { sessionId, jobs } = requireJobs(options);
        if (!params.task_id) throw new Error(`bash action=${action} requires task_id`);
        if (action === "wait") {
          const result = await waitBackgroundBashSession({
            sessionId,
            id: params.task_id,
            jobs,
            timeoutMs: params.timeout_ms,
            pattern: params.pattern,
            untilChangeChars: 0,
          });
          const outputTail = (result.item.output || "").slice(-4_000);
          const detectedPort = detectListenPort(outputTail);
          const summary = {
            matched: result.matched,
            changed: result.changed,
            timedOut: result.timedOut,
            exited: result.exited,
            status: result.item.status,
            pid: result.item.pid,
            command: result.item.command,
            detectedPort: detectedPort ?? null,
            outputTail,
          };
          const hint = result.matched
            ? "Ready. Do not poll read."
            : result.timedOut
              ? "Timed out. Increase timeout_ms once; do not tight-loop wait/read."
              : result.exited
                ? "Process exited before ready."
                : "Still starting — wait once more or inspect outputTail.";
          return textResult(`${JSON.stringify(summary, null, 2)}\n\n${hint}`, summary);
        }
        if (action === "read") {
          const item = await getBackgroundBashSession(sessionId, params.task_id, jobs);
          if (!item) throw new Error(`Background bash task ${params.task_id} not found`);
          return textResult(
            `${item.output || "(no output)"}\n\nPrefer action=wait instead of repeated read.`,
            item,
          );
        }
        if (action === "write") {
          if (!params.input) throw new Error("bash action=write requires input");
          writeBackgroundBashSession(sessionId, params.task_id, params.input);
          return textResult(`Wrote to background bash task ${params.task_id}`);
        }
        await jobs.cancel(params.task_id);
        const item = await getBackgroundBashSession(sessionId, params.task_id, jobs);
        return textResult(item?.output || `Stopped ${params.task_id}`, item);
      }

      if (params.run_in_background === true) {
        return runBackground(options, params);
      }
      return runForeground(options, params, signal);
    },
  };
}

export { stopBackgroundBashSessions };
