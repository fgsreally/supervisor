import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SupervisorDb } from "../src/db.js";
import { AgentResource } from "../src/resources/agent-resource.js";

let db: SupervisorDb;
let root: string;

beforeEach(() => {
  root = join(tmpdir(), `supervisor-agent-resource-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  db = new SupervisorDb(join(root, "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

describe("AgentResource", () => {
  it("统一加载并展开 Agent 绑定的 Skill 和 Prompt Template", async () => {
    const providerId = db.insertProvider({
      slug: "resource-test",
      name: "Resource Test",
      api_type: "openai",
    });
    const homeDir = join(root, "agent-home");
    const agent = db.insertAgent({
      name: "Resource Agent",
      provider_id: providerId,
      model_id: "test-model",
      home_dir: homeDir,
    });

    const skillDir = join(root, "review-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n请检查代码。",
      "utf8",
    );
    const promptPath = join(root, "answer.md");
    writeFileSync(promptPath, "---\ndescription: Answer a question\n---\n回答：$ARGUMENTS", "utf8");

    const skill = db.upsertResource({
      kind: "skill",
      slug: "review",
      name: "review",
      source_path: skillDir,
    });
    const prompt = db.upsertResource({
      kind: "prompt",
      slug: "answer",
      name: "answer",
      source_path: promptPath,
    });
    db.linkAgentResource(agent.id, skill.id);
    db.linkAgentResource(agent.id, prompt.id);

    const resource = new AgentResource({
      sessionId: 10,
      agentId: agent.id,
      cwd: root,
      db,
      agent,
    });
    await resource.load();

    expect(resource.skills).toHaveLength(1);
    expect(resource.promptTemplates).toHaveLength(1);
    expect(resource.getSlashCommands().map((command) => command.name)).toEqual([
      "skill:review",
      "answer",
    ]);
    expect(resource.expandPrompt("/skill:review src/index.ts")).toContain("请检查代码。");
    expect(resource.expandPrompt("/answer hello world")).toContain("回答：hello world");

    await resource.clear();
    expect(resource.skills).toHaveLength(0);
    expect(resource.promptTemplates).toHaveLength(0);
    expect(resource.getMcpTools()).toHaveLength(0);
  });

  it("每个 AgentResource 实例的加载状态彼此隔离", async () => {
    const first = new AgentResource({ sessionId: 1, agentId: 1, cwd: root, db });
    const second = new AgentResource({ sessionId: 2, agentId: 2, cwd: root, db });

    await first.load();
    await second.load();
    await first.clear();

    expect(first.skills).toHaveLength(0);
    expect(second.getSlashCommands()).toEqual([]);
    await second.clear();
  });
});
