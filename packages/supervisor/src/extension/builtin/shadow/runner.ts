import type { AgentHarnessEvent } from "@earendil-works/pi-agent-core";
import type { TSchema } from "typebox";
import type { SessionManager } from "../../../core/session/session-manager.js";
import { parseSessionMeta } from "../../../core/session/session-fields.js";
import { runWatson } from "../../../core/agent/watson.js";
import type { SupervisorDb } from "../../../db/db.js";
import type { Session, SessionCheckpoint } from "../../../types.js";
import { updateShadowRunMessage } from "../../../core/session/session-notice.js";
import { applyShadowMemoryUpdate, readShadowMemory } from "./memory.js";
import {
  createShadowResultSchema,
  formatShadowRunPrompt,
  getShadowSubmitResultDescription,
  getShadowSystemPrompt,
  normalizeShadowSubmitResult,
} from "./protocol.js";
import type { ShadowProtocolResult } from "./types.js";
import { sessionLogEvent } from "../../../utils/session-log.js";

export type ShadowRunPreparation = {
  startedAt: number;
  placeholderEntryId: string;
};

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
  preparation: ShadowRunPreparation,
): Promise<void> {
  const row = db.get(sessionId);
  if (!row) return;
  const session = manager.get(sessionId);
  if (!session || !shouldRunShadow(session) || session.projectId == null) return;

  const latestTurn = formatHarnessMessages(event.messages ?? []);
  if (!latestTurn) return;

  const shadowMemory = readShadowMemory(session.projectId, session.id);
  const { startedAt, placeholderEntryId } = preparation;

  setShadowRunning(manager, db, session.id, true);

  const startEvent = {
    type: "shadow.start" as const,
    sessionId: session.id,
    startedAt,
    checkpointId: checkpoint.id,
    placeholderEntryId,
    submitResultProperties: {} as Record<string, TSchema>,
  };

  try {
    await manager.emitSessionExtensionEvent(session.id, startEvent);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    sessionLogEvent(session.id, "error", "runtime.shadowHookFailed", {
      id: session.id,
      error: detail,
    });
  }

  const standardKeys = new Set(["shadowMemory", "suggestedQuestions", "title", "message", "level"]);
  const extensionProperties = Object.fromEntries(
    Object.entries(startEvent.submitResultProperties).filter(([key]) => !standardKeys.has(key)),
  );
  const extensionKeys = Object.keys(extensionProperties);

  let resultSchema: TSchema;
  try {
    resultSchema = createShadowResultSchema(extensionProperties);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    sessionLogEvent(session.id, "error", "runtime.shadowCompletionFailed", {
      id: session.id,
      error: detail,
    });
    updateShadowRunMessage(db, session.id, placeholderEntryId, { status: "failed" });
    setShadowRunning(manager, db, session.id, false);
    manager.publishShadowMessage(session.id, placeholderEntryId, "", "warning");
    return;
  }

  const finishFailed = () => {
    updateShadowRunMessage(db, session.id, placeholderEntryId, { status: "failed" });
    setShadowRunning(manager, db, session.id, false);
    manager.publishShadowMessage(session.id, placeholderEntryId, "", "warning");
  };

  let result: ShadowProtocolResult;
  try {
    const run = await runWatson({
      mode: "agent",
      sessionId: session.id,
      cwd: session.cwd,
      kind: "shadow",
      toolsPreset: "none",
      resultSchema,
      resultToolDescription: getShadowSubmitResultDescription(),
      systemPrompt: getShadowSystemPrompt(session.cwd),
      prompt: formatShadowRunPrompt(shadowMemory, latestTurn),
    });
    const normalized = normalizeShadowSubmitResult(run.result, resultSchema, extensionKeys);
    if (!normalized) {
      sessionLogEvent(session.id, "error", "runtime.shadowSubmitInvalid", { id: session.id });
      finishFailed();
      return;
    }
    result = normalized;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    sessionLogEvent(session.id, "error", "runtime.shadowCompletionFailed", {
      id: session.id,
      error: message,
    });
    finishFailed();
    return;
  }

  const message = result.message?.trim();
  const isInfo = result.level === "info" && Boolean(message);
  if (isInfo) applyShadowMemoryUpdate(session.projectId, session.id, result.shadowMemory);

  const suggestedQuestions = isInfo ? (result.suggestedQuestions ?? []) : [];
  const title = isInfo ? result.title?.replace(/\s+/g, " ").trim().slice(0, 80) : undefined;
  db.updateMeta(session.id, {
    shadow: {
      suggestedQuestions,
      memory: isInfo ? result.shadowMemory : undefined,
      memoryUpdated: isInfo && Boolean(result.shadowMemory),
      lastRunAt: Date.now(),
      running: false,
    },
  });
  if (title) db.updateSessionFields(session.id, { title });

  updateShadowRunMessage(db, session.id, placeholderEntryId, {
    status: "completed",
    text: message ?? "",
    level: result.level ?? "info",
  });
  setShadowRunning(manager, db, session.id, false);
  manager.publishShadowSuggestions(session.id, suggestedQuestions);
  manager.publishShadowMessage(
    session.id,
    placeholderEntryId,
    message ?? "",
    result.level ?? "info",
  );

  void manager
    .emitSessionExtensionEvent(session.id, {
      type: "shadow.completed",
      sessionId: session.id,
      startedAt,
      checkpointId: checkpoint.id,
      placeholderEntryId,
      checkpoint: {
        gitRef: checkpoint.gitRef,
        gitHead: checkpoint.gitHead ?? null,
      },
      result: {
        message,
        level: result.level,
        shadowMemory: result.shadowMemory,
        suggestedQuestions,
        title,
        extensions: result.extensions ?? {},
      },
    })
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      sessionLogEvent(session.id, "error", "runtime.shadowHookFailed", {
        id: session.id,
        error: detail,
      });
    });

  if (message && result.level === "error") {
    try {
      await manager.abort(session.id);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      sessionLogEvent(session.id, "error", "runtime.shadowInterruptFailed", {
        id: session.id,
        error: detail,
      });
    }
  }
}
