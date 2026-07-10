/**
 * Integration test helpers that use SessionManager (real agent harness)
 * with configurable test provider/model.
 *
 * Provider/model can be configured via environment variables or fallbacks to defaults.
 * Data is inserted into a temp SQLite DB for testing.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentHarnessEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { it } from "vitest";
import Database from "better-sqlite3";

export interface TestEnv {
  root: string;
  db: any;
  manager: any;
  cleanup: () => void;
}

export interface YesNoJudgeResult {
  verdict: "y" | "n";
  passed: boolean;
  raw: string;
}

let _SupervisorDbCached: any = null;
let _SessionManagerCached: any = null;

async function getSupervisorDb() {
  if (!_SupervisorDbCached) {
    _SupervisorDbCached = (await import("../../src/db/db.js")).SupervisorDb;
  }
  return _SupervisorDbCached;
}

async function getSessionManager() {
  if (!_SessionManagerCached) {
    _SessionManagerCached = (await import("../../src/core/session-manager.js")).SessionManager;
  }
  return _SessionManagerCached;
}

/** Test provider configuration (from env or defaults) */
function getTestProvider(): {
  id: string;
  name: string;
  apiType: string;
  baseUrl: string;
  apiKey: string | null;
  icon: string | null;
} {
  return {
    id: process.env.TEST_PROVIDER_ID || "test-minimax",
    name: process.env.TEST_PROVIDER_NAME || "Test MiniMax",
    apiType: process.env.TEST_PROVIDER_API_TYPE || "anthropic-messages",
    baseUrl: process.env.TEST_PROVIDER_BASE_URL || "https://api.minimaxi.com/anthropic",
    apiKey: process.env.TEST_PROVIDER_API_KEY || process.env.MINIMAX_CN_API_KEY || null,
    icon: process.env.TEST_PROVIDER_ICON || null,
  };
}

/** Test model configuration (from env or defaults) */
function getTestModel(): {
  providerId: number;
  modelId: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  supportsMultimodal: boolean;
} {
  return {
    providerId: parseInt(process.env.TEST_PROVIDER_ID || "1", 10),
    modelId: process.env.TEST_MODEL_ID || "MiniMax-M2.7",
    name: process.env.TEST_MODEL_NAME || "MiniMax M2.7",
    contextWindow: parseInt(process.env.TEST_MODEL_CONTEXT_WINDOW || "128000", 10),
    maxTokens: parseInt(process.env.TEST_MODEL_MAX_TOKENS || "16384", 10),
    supportsMultimodal: process.env.TEST_MODEL_SUPPORTS_MULTIMODAL === "true",
  };
}

/**
 * Create a test environment backed by SessionManager + temp SQLite,
 * with configurable test provider/model.
 */
export async function createTestEnv(): Promise<TestEnv> {
  const root = join(
    require("node:os").tmpdir(),
    `pi-int-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(root, { recursive: true });

  const provider = getTestProvider();
  const model = getTestModel();

  // Build the test DB
  const SupervisorDb = await getSupervisorDb();
  const testDb = new SupervisorDb(join(root, "test.db"));

  // Insert test provider/model directly into SQLite
  const testConn = new Database(join(root, "test.db"));
  const now = Date.now();

  testConn
    .prepare(
      `INSERT INTO providers (id, name, icon, api_type, base_url, api_key, is_enabled, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      provider.id,
      provider.name,
      provider.icon,
      provider.apiType,
      provider.baseUrl,
      provider.apiKey,
      1,
      now,
      now,
    );

  testConn
    .prepare(
      `INSERT INTO models (provider_id, model_id, name, context_window, max_tokens, supports_multimodal, tags, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      model.providerId,
      model.modelId,
      model.name,
      model.contextWindow,
      model.maxTokens,
      model.supportsMultimodal ? 1 : 0,
      "[]",
      now,
      now,
    );

  testConn.close();

  const SessionManager = await getSessionManager();
  const manager = new SessionManager(testDb);

  return {
    root,
    db: testDb,
    manager,
    cleanup: () => {
      try {
        manager.dispose();
      } catch {}
      try {
        testDb.close();
      } catch {}
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {}
    },
  };
}

export function writeTestFile(dir: string, name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

/**
 * Spawn a session with configured test provider, return the session.
 */
export async function spawnSession(
  env: TestEnv,
  opts: {
    systemPrompt?: string;
    provider?: string;
    model?: string;
  } = {},
) {
  const provider = getTestProvider();
  const model = getTestModel();

  const session = await env.manager.spawn({
    cwd: env.root,
    provider: opts.provider ?? provider.id,
    model: opts.model ?? model.modelId,
    systemPrompt:
      opts.systemPrompt ??
      "You are a helpful assistant. Use the tools available to you to complete the user's request.",
  });
  return session;
}

/**
 * Run a prompt and collect all events/messages.
 */
export async function runPrompt(
  env: TestEnv,
  sessionId: string,
  prompt: string,
): Promise<{ messages: AgentMessage[]; events: AgentHarnessEvent[] }> {
  const events: AgentHarnessEvent[] = [];
  const messages: AgentMessage[] = [];

  const unsub = env.manager.onOutput(sessionId, (_id, event) => {
    events.push(event);
    // Handle both AgentEvent and AgentHarnessOwnEvent
    if ("type" in event && event.type === "agent_end") {
      const evt = event as AgentHarnessEvent & { type: "agent_end"; messages?: AgentMessage[] };
      if (evt.messages) {
        messages.push(...evt.messages);
      }
    }
  });

  try {
    await env.manager.prompt(sessionId, prompt);
  } finally {
    unsub();
  }

  return { messages, events };
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "text") {
        return String((part as { text?: unknown }).text ?? "");
      }
      return "";
    })
    .join("");
}

async function getLastAssistantText(env: TestEnv, sessionId: string): Promise<string> {
  const { SQLiteSessionStorage } = await import("../../src/core/session-storage.js");
  const storage = new SQLiteSessionStorage(env.db, sessionId);
  const entries = await storage.getEntries();
  let text = "";
  for (const entry of entries) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      const next = textFromContent(entry.message.content);
      if (next) text = next;
    }
  }
  return text;
}

export function normalizeYesNoJudgeAnswer(text: string): "y" | "n" | null {
  const cleaned = text
    .replace(/```[a-z]*\s*/gi, "")
    .replace(/```/g, "")
    .trim()
    .toLowerCase();
  if (/^y(?:es)?(?:\b|[^a-z])/.test(cleaned)) return "y";
  if (/^n(?:o)?(?:\b|[^a-z])/.test(cleaned)) return "n";
  return null;
}

/**
 * Run a configured test LLM as a binary judge.
 * The judge must answer only "y" or "n"; parsing is intentionally strict.
 */
export async function judgeWithTestLlm(
  env: TestEnv,
  prompt: string,
  opts: {
    systemPrompt?: string;
    provider?: string;
    model?: string;
  } = {},
): Promise<YesNoJudgeResult> {
  const judgeSession = await spawnSession(env, {
    provider: opts.provider,
    model: opts.model,
    systemPrompt:
      opts.systemPrompt ??
      "You are a test judge. Decide whether the behavior satisfies the expected result. Respond with ONLY y or n.",
  });

  const { messages } = await runPrompt(
    env,
    judgeSession.id,
    `${prompt}\n\nReturn ONLY y for pass or n for fail. Do not include any explanation.`,
  );

  let raw = await getLastAssistantText(env, judgeSession.id);
  if (!raw) {
    for (const message of messages) {
      if (message.role === "assistant") {
        const next = textFromContent(message.content);
        if (next) raw = next;
      }
    }
  }
  const verdict = normalizeYesNoJudgeAnswer(raw) ?? "n";
  return { verdict, passed: verdict === "y", raw };
}

/**
 * Integration test conditional - skip if TEST_PROVIDER_API_KEY is not set.
 */
export function itIfProviderKey(name: string, fn: () => Promise<void>) {
  const provider = getTestProvider();
  const hasKey = !!provider.apiKey;
  const testFn = hasKey
    ? fn
    : async function skip() {
        /* skip */
      };
  (it as any)(name, { concurrent: false, timeout: 180_000, skip: !hasKey }, testFn);
}
