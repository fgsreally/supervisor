import type { AgentHarnessEvent } from "@earendil-works/pi-agent-core";
import { completeSimple, getEnvApiKey } from "@earendil-works/pi-ai";
import {
  findPackagedAgentId,
  getAgentHomeDir,
  readAgentHomeSystemPrompt,
} from "../../../agent/index.js";
import type { SessionManager } from "../../../core/session-manager.js";
import {
  DEFAULT_PARENT_MESSAGE_LEVEL,
  SESSION_INPUT_INTERRUPT_LEVEL,
} from "../../../core/session-input-queue.js";
import type { SupervisorDb } from "../../../db/db.js";
import type { Session, SessionCheckpoint } from "../../../types.js";
import { resolveModelWithProviderOverrides } from "../../../utils/model-utils.js";
import { resolveAssistantModelAuth } from "../../../utils/utility-llm.js";
import { applyShadowMemoryUpdate, readShadowMemory } from "./memory.js";
import {
  formatShadowRunPrompt,
  getShadowProtocolPrompt,
  parseShadowProtocolResponse,
} from "./protocol.js";

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

function extractAssistantText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text" && !!part.text)
    .map((part) => part.text)
    .join("")
    .trim();
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

  const configuredShadow = db.listMembers(session.id).find((member) => member.role === "shadow");
  let shadowAgentId = configuredShadow?.agentId ?? findPackagedAgentId(db, "shadow");
  if (shadowAgentId === undefined) return;
  let shadowAgent = db.getAgent(shadowAgentId);
  // Shadow must stay native — never run Codex/Claude/etc. as the silent observer.
  if (shadowAgent && shadowAgent.backendType !== "native") {
    console.warn(
      `shadow agent ${shadowAgentId} is external (${shadowAgent.backendType}); falling back to packaged Shadow`,
    );
    shadowAgentId = findPackagedAgentId(db, "shadow");
    if (shadowAgentId === undefined) return;
    shadowAgent = db.getAgent(shadowAgentId);
  }
  if (!shadowAgent) return;

  let model =
    shadowAgent.modelId && shadowAgent.providerId != null
      ? resolveModelWithProviderOverrides(db, shadowAgent.providerId, shadowAgent.modelId)
      : null;
  let apiKey: string | undefined;
  if (model && shadowAgent.providerId != null) {
    const provider = db.getProvider(shadowAgent.providerId);
    apiKey = getEnvApiKey(model.provider) ?? provider?.apiKey ?? undefined;
  } else {
    const assistantAuth = await resolveAssistantModelAuth(db);
    if (!assistantAuth) return;
    model = assistantAuth.model;
    apiKey = assistantAuth.apiKey;
  }
  const basePrompt = readAgentHomeSystemPrompt(getAgentHomeDir(shadowAgent.id));
  const systemPrompt = [basePrompt, getShadowProtocolPrompt()].filter(Boolean).join("\n\n");
  const shadowMemory = readShadowMemory(session.projectId, session.id);

  let responseText: string;
  try {
    const response = await completeSimple(
      model,
      {
        systemPrompt,
        messages: [
          {
            role: "user",
            content: formatShadowRunPrompt(shadowMemory, latestTurn),
            timestamp: Date.now(),
          },
        ],
      },
      { apiKey, timeoutMs: 120_000 },
    );
    responseText = extractAssistantText(response.content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`shadow completion failed [session=${session.id}]:`, message);
    return;
  }

  const result = parseShadowProtocolResponse(responseText);
  if (!result) return;
  applyShadowMemoryUpdate(session.projectId, session.id, result.shadowMemory);

  const suggestedQuestions = result.suggestedQuestions ?? [];
  db.updateMeta(session.id, {
    shadow: {
      agentId: shadowAgent.id,
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
      source: `shadow:${shadowAgent.id}`,
    });
  }
}
