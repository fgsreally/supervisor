import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SupervisorDb } from "../src/db.js";
import { AgentResource } from "../src/agent/runtime-resources.js";

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
    db.bindAgentResource(agent.id, skill.id);
    db.bindAgentResource(agent.id, prompt.id);

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
      "review",
      "answer",
    ]);
    expect(resource.expandPrompt("/skill:review src/index.ts")).toContain("请检查代码。");
    expect(resource.expandPrompt("/review src/index.ts")).toContain("请检查代码。");
    expect(resource.expandPrompt("/answer hello world")).toContain("回答：hello world");

    expect(resource.expandPrompt("Inspect @answer.md")).toContain(
      '<mentioned_file path="answer.md">',
    );

    const result = resource.executeSkillTool({
      name: "review",
      arguments: "src/index.ts",
    });
    expect(result.text).toContain('<skill_content name="review"');
    expect(result.text).toContain("Bundled resources have not been loaded");
    expect(result.details.operation).toBe("activate");

    await resource.clear();
    expect(resource.skills).toHaveLength(0);
    expect(resource.promptTemplates).toHaveLength(0);
  });

  it("模型只能通过 skill 工具加载允许自动调用的 Skill", async () => {
    const providerId = db.insertProvider({
      slug: "skill-tool-test",
      name: "Skill Tool Test",
      api_type: "openai",
    });
    const agent = db.insertAgent({
      name: "Skill Tool Agent",
      provider_id: providerId,
      model_id: "test-model",
      home_dir: join(root, "agent-home"),
    });

    for (const [name, disabled] of [
      ["visible", false],
      ["manual-only", true],
    ] as const) {
      const dir = join(root, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${name} skill\ndisable-model-invocation: ${disabled}\n---\nInstructions for ${name}`,
        "utf8",
      );
      const skill = db.upsertResource({
        kind: "skill",
        slug: name,
        name,
        source_path: dir,
      });
      db.bindAgentResource(agent.id, skill.id);
    }

    const resource = new AgentResource({ sessionId: 11, agentId: agent.id, cwd: root, db, agent });
    await resource.load();

    expect(resource.getSkillsPrompt()).toContain("<name>visible</name>");
    expect(resource.getSkillsPrompt()).not.toContain("manual-only");
    expect(resource.getSkillsPrompt()).not.toContain("<location>");

    expect(() => resource.executeSkillTool({ name: "manual-only" })).toThrow(
      'Skill "manual-only" not found',
    );
    expect(resource.expandPrompt("/skill:manual-only")).toContain("Instructions for manual-only");
    expect(
      resource.executeSkillTool({ name: "manual-only", path: "SKILL.md" }).details.operation,
    ).toBe("read");
  });

  it("通过 skill 工具浏览和分段读取附属资源，并阻止目录逃逸", async () => {
    const providerId = db.insertProvider({
      slug: "skill-files-test",
      name: "Skill Files Test",
      api_type: "openai",
    });
    const agent = db.insertAgent({
      name: "Skill Files Agent",
      provider_id: providerId,
      model_id: "test-model",
      home_dir: join(root, "agent-home"),
    });
    const skillDir = join(root, "file-reader");
    mkdirSync(join(skillDir, "references"), { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: file-reader\ndescription: Read bundled files\n---\nRead references on demand.",
      "utf8",
    );
    writeFileSync(join(skillDir, "references", "guide.md"), "one\ntwo\nthree", "utf8");
    writeFileSync(join(root, "secret.txt"), "outside", "utf8");
    const skill = db.upsertResource({
      kind: "skill",
      slug: "file-reader",
      name: "file-reader",
      source_path: skillDir,
    });
    db.bindAgentResource(agent.id, skill.id);

    const resource = new AgentResource({ sessionId: 12, agentId: agent.id, cwd: root, db, agent });
    await resource.load();

    const listing = resource.executeSkillTool({ name: "file-reader", path: "references" });
    expect(listing.details.operation).toBe("list");
    expect(listing.text).toContain("file\tguide.md");

    const file = resource.executeSkillTool({
      name: "file-reader",
      path: "references/guide.md",
      line_start: 2,
      line_end: 3,
    });
    expect(file.details.operation).toBe("read");
    expect(file.text).toBe("2: two\n3: three");
    expect(() => resource.executeSkillTool({ name: "file-reader", path: "../secret.txt" })).toThrow(
      "escapes the skill directory",
    );
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
