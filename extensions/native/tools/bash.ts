import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  loadPiNativesBindings,
  type MinimizerResult,
} from "../pi-natives-loader.js";
import { buildMinimizerOptions } from "../utils/minimizer-options.js";

const BASH_INTENT_ERROR =
  "bash tool requires a non-empty `intent` field describing why you are running this command.";

const DEFAULT_TIMEOUT_MS = 300_000;
const UPDATE_THROTTLE_MS = 100;

const bashSchema = Type.Object({
  command: Type.String({ description: "Bash command to execute" }),
  intent: Type.String({
    description: "One-line summary of why you are running this command",
  }),
  timeout: Type.Optional(
    Type.Number({ description: "Timeout in seconds (default 300, max 3600)" }),
  ),
  cwd: Type.Optional(Type.String({ description: "Working directory (defaults to session cwd)" })),
});

type BashParams = {
  command: string;
  intent: string;
  timeout?: number;
  cwd?: string;
};

function assertIntent(intent: unknown): void {
  if (typeof intent !== "string" || !intent.trim()) {
    throw new Error(BASH_INTENT_ERROR);
  }
}

function resolveTimeoutMs(timeout?: number): number {
  if (timeout === undefined || !Number.isFinite(timeout)) return DEFAULT_TIMEOUT_MS;
  const seconds = Math.max(1, Math.min(3600, Math.floor(timeout)));
  return seconds * 1000;
}

function appendStatus(text: string, status: string): string {
  return text ? `${text}\n\n${status}` : status;
}

function applyMinimizedOutput(text: string, minimized?: MinimizerResult): string {
  if (!minimized || minimized.text === minimized.originalText) return text;
  const footer = `[raw output minimized by ${minimized.filter}; ${minimized.inputBytes} -> ${minimized.outputBytes} bytes]`;
  const body = minimized.text.endsWith("\n") ? minimized.text : `${minimized.text}\n`;
  return `${body}${footer}`;
}

function formatFixupNotice(stripped: string[]): string | undefined {
  if (stripped.length === 0) return undefined;
  return `[command fixups removed: ${stripped.join(", ")}]`;
}

export function createNativeBashTool(sessionCwd: string): AgentTool {
  const settings = SettingsManager.create(sessionCwd);
  const commandPrefix = settings.getShellCommandPrefix();

  return {
    name: "bash",
    label: "bash",
    description:
      "Execute a bash command via omp Rust shell (pi-natives). Returns stdout and stderr. " +
      "Built-in output minimizer may compress known command noise. " +
      "The `intent` parameter is required.",
    parameters: bashSchema,
    async execute(_toolCallId, params, signal, onUpdate) {
      assertIntent((params as BashParams).intent);
      const { command, timeout, cwd } = params as BashParams;
      const trimmed = command?.trim();
      if (!trimmed) {
        throw new Error("bash tool requires a non-empty `command` field.");
      }

      const workdir = resolve(cwd?.trim() || sessionCwd);
      if (!existsSync(workdir)) {
        throw new Error(`Working directory does not exist: ${workdir}`);
      }

      const natives = loadPiNativesBindings();
      const fixup = natives.applyBashFixups(trimmed);
      const fixupNotice = formatFixupNotice(fixup.stripped);
      const commandBody = commandPrefix ? `${commandPrefix}\n${fixup.command}` : fixup.command;
      const timeoutMs = resolveTimeoutMs(timeout);

      let output = fixupNotice ? `${fixupNotice}\n` : "";
      let lastUpdateAt = 0;
      let updateTimer: ReturnType<typeof setTimeout> | undefined;
      let updateDirty = false;

      const emitUpdate = () => {
        if (!onUpdate) return;
        updateDirty = false;
        lastUpdateAt = Date.now();
        onUpdate({
          content: [{ type: "text", text: output }],
          details: undefined,
        });
      };

      const scheduleUpdate = () => {
        if (!onUpdate) return;
        updateDirty = true;
        const delay = UPDATE_THROTTLE_MS - (Date.now() - lastUpdateAt);
        if (delay <= 0) {
          if (updateTimer) clearTimeout(updateTimer);
          updateTimer = undefined;
          emitUpdate();
          return;
        }
        updateTimer ??= setTimeout(() => {
          updateTimer = undefined;
          emitUpdate();
        }, delay);
      };

      if (onUpdate) onUpdate({ content: [], details: undefined });

      if (signal?.aborted) {
        throw new Error(appendStatus(output, "Command aborted"));
      }

      try {
        const result = await natives.executeShell(
          {
            command: commandBody,
            cwd: workdir,
            timeoutMs,
            minimizer: buildMinimizerOptions(),
            signal,
          },
          (_error, chunk) => {
            output += chunk;
            scheduleUpdate();
          },
        );

        if (updateTimer) {
          clearTimeout(updateTimer);
          updateTimer = undefined;
        }
        if (updateDirty) emitUpdate();

        output = applyMinimizedOutput(output, result.minimized);

        if (result.cancelled) {
          throw new Error(appendStatus(output, "Command aborted"));
        }
        if (result.timedOut) {
          throw new Error(
            appendStatus(output, `Command timed out after ${Math.round(timeoutMs / 1000)} seconds`),
          );
        }
        if (result.exitCode !== undefined && result.exitCode !== 0) {
          throw new Error(appendStatus(output, `Command exited with code ${result.exitCode}`));
        }

        const text = output || "(no output)";
        return {
          content: [{ type: "text", text }],
          details: {
            exitCode: result.exitCode,
            workingDir: result.workingDir,
            engine: "pi-natives",
            minimized: result.minimized?.filter,
            fixups: fixup.stripped.length > 0 ? fixup.stripped : undefined,
          },
        };
      } finally {
        if (updateTimer) clearTimeout(updateTimer);
      }
    },
  };
}
