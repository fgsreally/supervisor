import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dedupeBuiltinAssistantSessions,
  ensurePackagedAgents,
  findPackagedAgentId,
  isBuiltinAgent,
  loadPackagedAgentPrompt,
} from "../src/agent/index.js";
import { SupervisorDb } from "../src/db.js";

let db: SupervisorDb;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `internal-agents-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new SupervisorDb(join(tmpDir, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function configureModel(): void {
  const providerId = db.insertProvider({
    slug: "test-provider",
    name: "Test Provider",
    protocol: "anthropic-messages",
  });
  db.insertModel({ provider_id: providerId, model_id: "claude-sonnet-4-6", name: "Sonnet" });
}

describe("packaged agents", () => {
  it("migrates the legacy Intro resources into the single Pi assistant", () => {
    configureModel();
    const modelId = db.listModels()[0]!.id;
    const assistant = db.insertAgent({
      name: "Pi 助手",
      model_id: modelId,
      is_builtin: true,
      meta: {},
    });
    const intro = db.insertAgent({
      name: "Intro",
      model_id: modelId,
      is_builtin: true,
      meta: {},
    });
    const resource = db.upsertResource({
      kind: "skill",
      slug: "legacy-intro-skill",
      source_path: join(tmpDir, "legacy-intro-skill"),
    });
    db.bindAgentResource(intro.id, resource.id);

    dedupeBuiltinAssistantSessions(db);

    expect(db.getAgent(intro.id)).toBeUndefined();
    expect(db.getAgentResourceBinding(assistant.id, resource.id)?.enabled).toBe(true);
  });

  it("registers Codex, Claude Code, Kimi Code, Cursor, and MiMo Code without requiring a provider", () => {
    ensurePackagedAgents(db);
    const external = db.listAgents().filter((agent) => agent.backendType !== "native");
    expect(external).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Codex", backendType: "codex", providerId: null }),
        expect.objectContaining({
          name: "Claude Code",
          backendType: "claude",
          providerId: null,
        }),
        expect.objectContaining({
          name: "Kimi Code",
          backendType: "kimi",
          providerId: null,
          avatar: "https://avatars.githubusercontent.com/u/129152888?s=48&v=4",
          externalConfig: {
            command: "kimi",
            args: ["acp"],
            detectArgs: ["--version"],
            installCommand: "npm install -g @moonshot-ai/kimi-code",
          },
        }),
        expect.objectContaining({
          name: "Cursor",
          backendType: "cursor",
          providerId: null,
          avatar: "/icons/cursor.png",
          externalConfig: {
            command: "cursor-agent",
            args: ["acp"],
            detectArgs: ["--version"],
            installCommand: expect.any(String),
          },
        }),
        expect.objectContaining({
          name: "MiMo Code",
          backendType: "mimo",
          providerId: null,
          avatar: "/icons/mimo.png",
          externalConfig: {
            command: "mimo",
            args: ["acp"],
            detectArgs: ["--version"],
            installCommand: expect.any(String),
          },
        }),
      ]),
    );
  });

  it("loads packaged prompt.md files", () => {
    expect(loadPackagedAgentPrompt("shadow")).toContain("影子代理");
    expect(loadPackagedAgentPrompt("intro")).toContain("Intro");
    expect(loadPackagedAgentPrompt("btw")).toContain("只读侧问代理");
    expect(loadPackagedAgentPrompt("coding")).toContain("环境变量");
    expect(loadPackagedAgentPrompt("coding")).not.toContain("Available tools");
    expect(loadPackagedAgentPrompt("coding")).not.toContain("多 session");
    expect(loadPackagedAgentPrompt("coding")).toContain("coding agent");
  });

  it("marks all packaged agents built-in with a spawn type", () => {
    configureModel();
    ensurePackagedAgents(db);
    const shadowId = findPackagedAgentId(db, "shadow");
    const introId = findPackagedAgentId(db, "intro");
    const btwId = findPackagedAgentId(db, "btw");
    const codingId = findPackagedAgentId(db, "coding");
    expect(shadowId).toBeDefined();
    expect(introId).toBeDefined();
    expect(btwId).toBeDefined();
    expect(codingId).toBeDefined();

    const shadow = db.getAgent(shadowId!);
    const intro = db.getAgent(introId!);
    const btw = db.getAgent(btwId!);
    const coding = db.getAgent(codingId!);
    expect(shadow?.isBuiltin).toBe(true);
    expect(intro?.isBuiltin).toBe(true);
    expect(coding?.isBuiltin).toBe(true);
    expect(shadow?.spawnType).toBe("shadow");
    expect(intro?.spawnType).toBe("intro");
    expect(coding?.spawnType).toBe("coding");
    expect(shadow?.meta).toEqual({});
    expect(intro?.meta).toEqual({});
    expect(coding?.meta).toEqual({});
    expect(shadow?.toolsPreset).toBe("none");
    expect(shadow?.homeDir).toBeNull();
    expect(intro?.toolsPreset).toBe("coding");
    expect(coding?.toolsPreset).toBe("coding");
    expect(btw?.toolsPreset).toBe("readonly");
    expect(btw?.isBuiltin).toBe(true);
    expect(isBuiltinAgent(shadow)).toBe(true);
    expect(isBuiltinAgent(intro)).toBe(true);
    expect(isBuiltinAgent(coding)).toBe(true);
  });

  it("does not rewrite an existing packaged agent row", () => {
    configureModel();
    ensurePackagedAgents(db);
    const shadowId = findPackagedAgentId(db, "shadow")!;
    db.updateAgent(shadowId, { name: "Local Shadow" });

    ensurePackagedAgents(db);

    expect(db.getAgent(shadowId)?.name).toBe("Local Shadow");
  });
});
