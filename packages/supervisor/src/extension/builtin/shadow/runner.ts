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
import type { Session } from "../../../types.js";
import { resolveModelWithProviderOverrides } from "../../../utils/model-utils.js";
import { applyShadowMemoryUpdate, readShadowMemory } from "./memory.js";
import {
  formatShadowRunPrompt,
  getShadowProtocolPrompt,
  parseShadowProtocolResponse,
} from "./protocol.js";
import type { ShadowUrgency } from "./types.js";

function parseMeta(meta: Session["meta"]): Record<string, unknown> {
  if (!meta) return {};
  return typeof meta === "string" ? JSON.parse(meta) : (meta as Record<string, unknown>);
}

function shouldRunShadow(session: Session): boolean {
  if (session.parentId !== null) return false;
  const meta = parseMeta(session.meta);
  return meta.builtin !== true && meta.shadowDisabled !== true;
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

export function shadowUrgencyToLevel(urgency: ShadowUrgency | undefined): number {
  if (urgency === "normal") return 50;
  if (urgency === "high") return 80;
  if (urgency === "critical") return SESSION_INPUT_INTERRUPT_LEVEL;
  return DEFAULT_PARENT_MESSAGE_LEVEL;
}

export async function runShadow(
  manager: SessionManager,
  db: SupervisorDb,
  sessionId: number,
  event: Extract<AgentHarnessEvent, { type: "agent_end" }>,
): Promise<void> {
  const row = db.get(sessionId);
  if (!row) return;
  const session = manager.get(sessionId);
  if (!session || !shouldRunShadow(session) || session.projectId == null) return;

  const latestTurn = formatHarnessMessages(event.messages ?? []);
  if (!latestTurn) return;

  const shadowAgentId = findPackagedAgentId(db, "shadow");
  if (shadowAgentId === undefined) return;
  const shadowAgent = db.getAgent(shadowAgentId);
  if (!shadowAgent?.modelId) return;

  const model = resolveModelWithProviderOverrides(db, shadowAgent.providerId, shadowAgent.modelId);
  if (!model) return;
  const provider = db.getProvider(shadowAgent.providerId);
  const apiKey = getEnvApiKey(model.provider) ?? provider?.apiKey ?? undefined;
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
      { apiKey, reasoning: "off", timeoutMs: 120_000 },
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
  db.updateMeta(session.id, { shadowSuggestedQuestions: suggestedQuestions });
  manager.publishShadowSuggestions(session.id, suggestedQuestions);

  const title = result.title?.replace(/\s+/g, " ").trim().slice(0, 80);
  if (title) db.updateMeta(session.id, { name: title });

  const message = result.message?.trim();
  if (message) {
    await manager.submitSessionInput(session.id, {
      message,
      level: shadowUrgencyToLevel(result.urgency),
      source: `shadow:${shadowAgent.id}`,
    });
  }

  // suggestion is parsed now; delivery waits for the planned WebSocket session event channel.
}
