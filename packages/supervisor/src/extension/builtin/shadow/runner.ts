import type { AgentHarnessEvent } from "@earendil-works/pi-agent-core";
import type { SessionManager } from "../../../core/session-manager.js";
import { SESSION_INPUT_INTERRUPT_LEVEL } from "../../../core/session-input-queue.js";
import { parseSessionMeta } from "../../../core/session-fields.js";
import { runWatson } from "../../../core/watson.js";
import { SHADOW_ANALYSIS_MESSAGE_TYPE } from "../../../core/session-notice.js";
import type { SupervisorDb } from "../../../db/db.js";
import type { Session, SessionCheckpoint } from "../../../types.js";
import { applyShadowMemoryUpdate, readShadowMemory } from "./memory.js";
import {
  formatShadowRunPrompt,
  getShadowSubmitResultDescription,
  getShadowSystemPrompt,
  normalizeShadowSubmitResult,
  ShadowResultSchema,
} from "./protocol.js";
import type { ShadowProtocolResult } from "./types.js";
import { writeLog } from "../../../i18n/logs.js";

function shouldRunShadow(session: Session): boolean {
  if (session.parentId !== null) return false;
  return session.shadowEnabled && !session.isBuiltin;
}

function formatHarnessMessages(messages: unknown[]): string {
  const lines: string[] = [];
  for (const item of messages) {
    if (!item || typeof item !== "object") continue;
    const record = item as { role?: string; content?: unknown };
    const role = record.role ?? "unknown";
    let content = "";
    if (typeof record.content === "string") {
      content = record.content;
    } else if (Array.isArray(record.content)) {
      content = record.content
        .map((part) => {
          if (!part || typeof part !== "object") return "";
          const value = part as { type?: string; text?: string };
          return value.type === "text" ? (value.text ?? "") : "";
        })
        .filter(Boolean)
        .join("\n");
    }
    if (content.trim()) lines.push(`[${role}] ${content.trim()}`);
  }
  return lines.join("\n\n");
}

function setShadowRunning(
  manager: SessionManager,
  db: SupervisorDb,
  sessionId: number,
  running: boolean,
): void {
  const row = db.get(sessionId);
  if (!row) return;
  const meta = parseSessionMeta(row.meta);
  const shadow =
    meta.shadow && typeof meta.shadow === "object" && !Array.isArray(meta.shadow)
      ? { ...(meta.shadow as Record<string, unknown>) }
      : {};
  db.updateMeta(sessionId, { shadow: { ...shadow, running } });
  manager.publishShadowRunning(sessionId, running);
}

export async function runShadow(
  manager: SessionManager,
  db: SupervisorDb,
  sessionId: number,
  event: Extract<AgentHarnessEvent, { type: "agent_end" }>,
  checkpoint: SessionCheckpoint,
): Promise<void> {
  const row = db.get(sessionId);
  if (!row) return;
  const session = manager.get(sessionId);
  if (!session || !shouldRunShadow(session) || session.projectId == null) return;

  const latestTurn = formatHarnessMessages(event.messages ?? []);
  if (!latestTurn) return;

  const shadowMemory = readShadowMemory(session.projectId, session.id);

  setShadowRunning(manager, db, session.id, true);

  let result: ShadowProtocolResult;
  try {
    const run = await runWatson({
      mode: "agent",
      cwd: session.cwd,
      kind: "shadow",
      toolsPreset: "none",
      resultSchema: ShadowResultSchema,
      resultToolDescription: getShadowSubmitResultDescription(),
      systemPrompt: getShadowSystemPrompt(session.cwd),
      prompt: formatShadowRunPrompt(shadowMemory, latestTurn),
    });
    const normalized = normalizeShadowSubmitResult(run.result);
    if (!normalized) {
      writeLog("error", "runtime.shadowSubmitInvalid", { id: session.id });
      setShadowRunning(manager, db, session.id, false);
      return;
    }
    result = normalized;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    writeLog("error", "runtime.shadowCompletionFailed", { id: session.id, error: message });
    setShadowRunning(manager, db, session.id, false);
    return;
  }

  applyShadowMemoryUpdate(session.projectId, session.id, result.shadowMemory);

  const suggestedQuestions = result.suggestedQuestions ?? [];
  db.updateMeta(session.id, {
    shadow: {
      suggestedQuestions,
      lastAlert: result.alert,
      lastAnalysis: result.analysis,
      title: result.title,
      commitMessage: result.commitMessage,
      memory: result.shadowMemory,
      memoryUpdated: Boolean(result.shadowMemory),
      lastRunAt: Date.now(),
      running: false,
    },
  });
  manager.publishShadowRunning(session.id, false);
  manager.publishShadowSuggestions(session.id, suggestedQuestions);

  const title = result.title?.replace(/\s+/g, " ").trim().slice(0, 80);
  if (title) db.updateSessionFields(session.id, { title });

  const commitMessage = result.commitMessage?.replace(/\s+/g, " ").trim().slice(0, 120);
  if (commitMessage) {
    try {
      await manager.commitCheckpoint(session.id, checkpoint.id, commitMessage);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      writeLog("error", "runtime.shadowSnapshotFailed", { id: session.id, error: message });
    }
  }

  const alert = result.alert?.trim();
  if (alert) {
    await manager.submitSessionInput(session.id, {
      message: alert,
      level: SESSION_INPUT_INTERRUPT_LEVEL,
      source: "shadow:alert",
    });
  }
  const analysis = result.analysis?.trim();
  if (analysis) {
    await manager.sendCustomMessage(session.id, analysis, SHADOW_ANALYSIS_MESSAGE_TYPE);
    manager.publishShadowAnalysis(session.id);
  }
}
