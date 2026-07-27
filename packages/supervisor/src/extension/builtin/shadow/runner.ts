import type { AgentHarnessEvent } from "@earendil-works/pi-agent-core";
import { findPackagedAgentId } from "../../../agent/index.js";
import type { SessionManager } from "../../../core/session-manager.js";
import {
  DEFAULT_PARENT_MESSAGE_LEVEL,
  SESSION_INPUT_INTERRUPT_LEVEL,
} from "../../../core/session-input-queue.js";
import { runWatsonTask } from "../../../core/watson.js";
import type { SupervisorDb } from "../../../db/db.js";
import type { Session, SessionCheckpoint } from "../../../types.js";
import { applyShadowMemoryUpdate, readShadowMemory } from "./memory.js";
import {
  formatShadowRunPrompt,
  getShadowSystemPrompt,
  normalizeShadowSubmitResult,
} from "./protocol.js";
import type { ShadowProtocolResult } from "./types.js";

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

function resolveShadowAgentId(db: SupervisorDb): number | null {
  return findPackagedAgentId(db, "shadow") ?? findPackagedAgentId(db, "watson") ?? null;
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

  const shadowAgentId = resolveShadowAgentId(db);
  const shadowMemory = readShadowMemory(session.projectId, session.id);

  let result: ShadowProtocolResult;
  try {
    const run = await runWatsonTask<unknown>({
      db,
      cwd: session.cwd,
      kind: "shadow",
      toolsPreset: "none",
      structured: true,
      systemPrompt: getShadowSystemPrompt(),
      prompt: formatShadowRunPrompt(shadowMemory, latestTurn),
    });
    const normalized = normalizeShadowSubmitResult(run.result);
    if (!normalized) {
      console.error(`shadow submit_result invalid [session=${session.id}]`);
      return;
    }
    result = normalized;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`shadow completion failed [session=${session.id}]:`, message);
    return;
  }

  applyShadowMemoryUpdate(session.projectId, session.id, result.shadowMemory);

  const suggestedQuestions = result.suggestedQuestions ?? [];
  db.updateMeta(session.id, {
    shadow: {
      agentId: shadowAgentId,
      suggestedQuestions,
      message: result.message,
      interrupt: result.interrupt === true,
      status: result.status,
      title: result.title,
      commitMessage: result.commitMessage,
      memory: result.shadowMemory,
      memoryUpdated: Boolean(result.shadowMemory),
      lastRunAt: Date.now(),
    },
  });
  manager.publishShadowSuggestions(session.id, suggestedQuestions);

  const title = result.title?.replace(/\s+/g, " ").trim().slice(0, 80);
  if (title) db.updateSessionFields(session.id, { title });

  const commitMessage = result.commitMessage?.replace(/\s+/g, " ").trim().slice(0, 120);
  if (commitMessage) {
    try {
      await manager.commitCheckpoint(session.id, checkpoint.id, commitMessage);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`shadow snapshot commit failed [session=${session.id}]:`, message);
    }
  }

  const message = result.message?.trim();
  if (message) {
    await manager.submitSessionInput(session.id, {
      message,
      level: result.interrupt ? SESSION_INPUT_INTERRUPT_LEVEL : DEFAULT_PARENT_MESSAGE_LEVEL,
      source: shadowAgentId != null ? `shadow:${shadowAgentId}` : "shadow",
    });
  }
}
