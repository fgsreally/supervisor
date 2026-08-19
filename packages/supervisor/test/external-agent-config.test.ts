import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SupervisorDb } from "../src/db.js";
import { ensurePackagedAgents } from "../src/agent/index.js";
import {
  externalAgentAvailability,
  getExternalAgentDetectArgs,
  getExternalAgentInstallCommand,
  resolveExternalAgentInstallShellCommand,
} from "../src/core/session/external/external-agent-config.js";

let db: SupervisorDb;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `external-agent-config-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new SupervisorDb(join(tmpDir, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("external agent availability", () => {
  it("seeds detect and install fields for packaged external agents", () => {
    ensurePackagedAgents(db);
    const codex = db.listAgents().find((agent) => agent.backendType === "codex");
    expect(codex?.externalConfig).toEqual(
      expect.objectContaining({
        command: "codex",
        detectArgs: ["--version"],
        installCommand: "npm install -g @openai/codex",
      }),
    );
  });

  it("uses detectArgs from externalConfig", () => {
    ensurePackagedAgents(db);
    const codex = db.listAgents().find((agent) => agent.backendType === "codex")!;
    expect(getExternalAgentDetectArgs(codex)).toEqual(["--version"]);
    expect(getExternalAgentInstallCommand(codex)).toContain("npm install -g @openai/codex");
  });

  it("marks native agents as always available", () => {
    const availability = externalAgentAvailability({
      id: 1,
      name: "Native",
      description: null,
      avatar: null,
      providerId: null,
      backendType: "native",
      modelId: null,
      systemPrompt: null,
      toolsPreset: "coding",
      homeDir: null,
      isBuiltin: false,
      externalConfig: null,
      permissionRules: { allow: [], deny: [] },
      meta: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(availability.available).toBe(true);
    expect(availability.installCommand).toBeNull();
  });

  it("reports unavailable when executable is missing", () => {
    ensurePackagedAgents(db);
    const codex = db.listAgents().find((agent) => agent.backendType === "codex")!;
    db.updateAgent(codex.id, {
      external_config: JSON.stringify({
        command: "definitely-not-a-real-supervisor-cli-tool",
        detectArgs: ["--version"],
        installCommand: "npm install -g @openai/codex",
      }),
    });
    const updated = db.getAgent(codex.id)!;
    const availability = externalAgentAvailability(updated);
    expect(availability.available).toBe(false);
    expect(availability.unavailableReason).toContain("未找到外部 Agent 命令");
    expect(availability.installCommand).toContain("npm install -g @openai/codex");
  });

  it("wraps PowerShell install one-liners on Windows", () => {
    const resolved = resolveExternalAgentInstallShellCommand(
      "irm 'https://cursor.com/install?win32=true' | iex",
    );
    if (process.platform === "win32") {
      expect(resolved).toMatch(/^powershell -ep Bypass -c /);
    } else {
      expect(resolved).toBe("irm 'https://cursor.com/install?win32=true' | iex");
    }
  });
});
