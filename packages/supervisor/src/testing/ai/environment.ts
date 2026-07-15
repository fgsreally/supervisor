import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { AgentHarnessEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { SupervisorDb } from "../../db/db.js";
import { SessionManager } from "../../core/session-manager.js";
import { SQLiteSessionStorage } from "../../core/session-storage.js";
import { readAiSubjectConfig } from "./config.js";
import type {
  AiScenarioInput,
  AiScenarioResult,
  AiTestEnvironment,
  AiTestEnvironmentOptions,
  AiToolCall,
} from "./types.js";

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        Boolean(part) && typeof part === "object" && part.type === "text" && !!part.text,
    )
    .map((part) => part.text)
    .join("");
}

function collectToolCalls(events: AgentHarnessEvent[]): AiToolCall[] {
  const calls: AiToolCall[] = [];
  for (const event of events) {
    const item = event as unknown as Record<string, unknown>;
    if (item.type !== "tool_execution_start" && item.type !== "tool_execution_end") continue;
    calls.push({
      type: item.type === "tool_execution_start" ? "start" : "end",
      name: String(item.toolName ?? item.name ?? "unknown"),
      ...(item.args !== undefined ? { args: item.args } : {}),
      ...(item.result !== undefined ? { result: item.result } : {}),
    });
  }
  return calls;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "scenario";
}

function writeArtifacts(directory: string, result: AiScenarioResult): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "subject-output.md"), `${result.finalText}\n`, "utf8");
  writeFileSync(
    join(directory, "events.json"),
    `${JSON.stringify(result.events, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(directory, "result.json"),
    `${JSON.stringify({ ...result, events: undefined, messages: undefined }, null, 2)}\n`,
    "utf8",
  );
}

function extensionSlug(source: string, index: number): string {
  const raw = basename(resolve(source))
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
  return raw || `extension-${index + 1}`;
}

async function readMessages(db: SupervisorDb, sessionId: number): Promise<AgentMessage[]> {
  const entries = await new SQLiteSessionStorage(db, sessionId).getEntries();
  return entries
    .filter((entry): entry is typeof entry & { type: "message" } => entry.type === "message")
    .map((entry) => entry.message);
}

export async function createAiTestEnvironment(
  options: AiTestEnvironmentOptions = {},
): Promise<AiTestEnvironment> {
  const root = mkdtempSync(join(tmpdir(), "supervisor-ai-test-"));
  const cwd = options.cwd ? resolve(options.cwd) : join(root, "workspace");
  if (options.fixture) cpSync(resolve(options.fixture), cwd, { recursive: true });
  else mkdirSync(cwd, { recursive: true });

  const db = new SupervisorDb(join(root, "supervisor.db"));
  const subject = readAiSubjectConfig(options.subject);
  const providerId = db.insertProvider({
    slug: subject.provider,
    name: subject.name,
    api_type: subject.apiType,
    base_url: subject.baseUrl,
    api_key: subject.apiKey,
  });
  db.insertModel({
    provider_id: providerId,
    model_id: subject.model,
    context_window: subject.contextWindow,
    max_tokens: subject.maxTokens,
  });
  const agent = db.insertAgent({
    name: "AI test subject",
    provider_id: providerId,
    model_id: subject.model,
    tools_preset: "coding",
    home_dir: join(root, "agent-home"),
  });
  const manager = new SessionManager(db);
  await manager.ensureResourceCatalog();

  for (const [index, source] of (options.extensions ?? []).entries()) {
    const slug = extensionSlug(source, index);
    const resource = db.upsertResource({
      kind: "extension",
      slug,
      name: slug,
      source_path: resolve(source),
    });
    db.bindAgentResource(agent.id, resource.id);
    await manager.getExtensionRegistry().reload(db, slug);
  }

  let disposed = false;
  return {
    root,
    cwd,
    async run(input: AiScenarioInput): Promise<AiScenarioResult> {
      if (disposed) throw new Error("AI test environment has already been cleaned up");
      const session = await manager.spawn({
        cwd,
        agentId: agent.id,
        systemPrompt:
          input.systemPrompt ??
          "You are a coding assistant. Complete the requested task using the available tools.",
        toolsPreset: input.toolsPreset ?? "coding",
      });
      const events: AgentHarnessEvent[] = [];
      const unsubscribe = manager.onOutput(session.id, (_sessionId, event) => events.push(event));
      const startedAt = Date.now();
      try {
        await manager.prompt(session.id, input.prompt);
      } finally {
        unsubscribe();
      }
      const messages = await readMessages(db, session.id);
      const finalText = [...messages].reverse().find((message) => message.role === "assistant");
      const result: AiScenarioResult = {
        name: input.name ?? "scenario",
        prompt: input.prompt,
        cwd,
        messages,
        events,
        toolCalls: collectToolCalls(events),
        finalText: finalText ? textFromContent(finalText.content) : "",
        durationMs: Date.now() - startedAt,
      };
      const artifactsRoot = options.artifactsDir ?? process.env.AI_TEST_ARTIFACTS_DIR;
      if (artifactsRoot) {
        const directory = join(resolve(artifactsRoot), safeName(result.name), String(Date.now()));
        result.artifactDir = directory;
        writeArtifacts(directory, result);
      }
      return result;
    },
    cleanup(): void {
      if (disposed) return;
      disposed = true;
      manager.dispose();
      db.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export async function withAiTestEnvironment<T>(
  options: AiTestEnvironmentOptions,
  run: (environment: AiTestEnvironment) => Promise<T>,
): Promise<T> {
  const environment = await createAiTestEnvironment(options);
  try {
    return await run(environment);
  } finally {
    environment.cleanup();
  }
}

export async function runAiScenario(
  options: AiTestEnvironmentOptions & AiScenarioInput,
): Promise<AiScenarioResult> {
  const { name, prompt, systemPrompt, toolsPreset, ...environmentOptions } = options;
  return withAiTestEnvironment(environmentOptions, (environment) =>
    environment.run({ name, prompt, systemPrompt, toolsPreset }),
  );
}
