import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertAgentUserSpawnable,
  ensurePackagedAgents,
  findPackagedAgentId,
  isAgentUserSpawnable,
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
    api_type: "anthropic-messages",
  });
  db.insertModel({ provider_id: providerId, model_id: "claude-sonnet-4-6", name: "Sonnet" });
}

describe("packaged agents", () => {
  it("registers Codex, Claude Code, and Kimi Code without requiring a provider", () => {
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
          icon: "https://avatars.githubusercontent.com/u/129152888?s=48&v=4",
          meta: expect.objectContaining({ command: "kimi", args: ["acp"] }),
        }),
      ]),
    );
  });

  it("loads packaged prompt.md files", () => {
    expect(loadPackagedAgentPrompt("shadow")).toContain("影子代理");
    expect(loadPackagedAgentPrompt("intro")).toContain("Intro");
  });

  it("marks shadow internal, tool-less, and intro user-spawnable", () => {
    configureModel();
    ensurePackagedAgents(db);
    const shadowId = findPackagedAgentId(db, "shadow");
    const introId = findPackagedAgentId(db, "intro");
    expect(shadowId).toBeDefined();
    expect(introId).toBeDefined();

    const shadow = db.getAgent(shadowId!);
    const intro = db.getAgent(introId!);
    expect(shadow?.isInternal).toBe(true);
    expect(intro?.isInternal).toBe(false);
    expect(shadow?.meta).toEqual({
      builtin: true,
      packagedKind: "shadow",
      userSpawnable: false,
    });
    expect(intro?.meta).toEqual({
      builtin: true,
      packagedKind: "intro",
      userSpawnable: true,
    });
    expect(shadow?.toolsPreset).toBe("none");
    expect(shadow?.homeDir).toBeNull();
    expect(intro?.toolsPreset).toBe("coding");
    expect(isBuiltinAgent(shadow)).toBe(true);
    expect(isBuiltinAgent(intro)).toBe(true);
    expect(isAgentUserSpawnable(shadow)).toBe(false);
    expect(isAgentUserSpawnable(intro)).toBe(true);
    expect(() => assertAgentUserSpawnable(shadow, shadowId)).toThrow(/internal/i);
    expect(() => assertAgentUserSpawnable(intro, introId)).not.toThrow();
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
