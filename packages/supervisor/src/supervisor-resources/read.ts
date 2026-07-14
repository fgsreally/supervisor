import type { ExtensionSqliteDatabase } from "../extension-system/types.js";
import type { ExtensionContext } from "../extension-system/types.js";
import { getAgentHomeDir } from "../agent/agent-paths.js";
import { loadSkills } from "../resources/skills.js";
import { loadPromptTemplates } from "../resources/prompt-templates.js";
import {
  listAgentResourcePathsFromSqlite,
  listAgentToolSlugsFromSqlite,
} from "../resources/sqlite-bindings.js";
import type { Agent } from "../types.js";
import type { ParsedSupervisorResourceUrl } from "./parse.js";
import { parseSupervisorResourceUrl } from "./parse.js";

function parsePayloadText(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

export async function assertCanReadSession(
  ctx: ExtensionContext,
  sessionId: number,
): Promise<void> {
  if (sessionId === ctx.session.id) return;
  const children = await ctx.session.children();
  if (children.some((child) => child.id === sessionId)) return;
  throw new Error(`Session ${sessionId} is not readable from session ${ctx.session.id}`);
}

export async function assertCanReadAgent(ctx: ExtensionContext, agentId: number): Promise<void> {
  if (agentId === ctx.agent.id) return;
  const shadowTags = ["shadow", "sidecar"];
  for (const tag of shadowTags) {
    const members = await ctx.agent.findByTag(tag);
    if (members.some((member) => member.id === agentId)) return;
  }
  const spawned = await ctx.agent.findByRole("spawned");
  if (spawned.some((member) => member.id === agentId)) return;
  throw new Error(`Agent ${agentId} is not readable from session ${ctx.session.id}`);
}

async function readSessionResource(
  sqlite: ExtensionSqliteDatabase,
  sessionId: number,
  resource: string,
  limit: number,
): Promise<unknown> {
  if (resource === "messages" || resource === "branch") {
    const rows = sqlite
      .prepare(
        `SELECT entry_id, type, message_role, payload, created_at
         FROM messages
         WHERE session_id = ?
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(sessionId, limit) as Array<{
      entry_id: string;
      type: string;
      message_role: string | null;
      payload: string;
      created_at: number;
    }>;
    return rows.map((row) => ({
      entryId: row.entry_id,
      type: row.type,
      role: row.message_role,
      payload: parsePayloadText(row.payload),
      createdAt: row.created_at,
    }));
  }

  if (resource === "result" || resource === "summary") {
    const row = sqlite
      .prepare(
        `SELECT payload, created_at
         FROM messages
         WHERE session_id = ? AND message_role = 'assistant'
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(sessionId) as { payload?: string; created_at?: number } | undefined;
    return {
      sessionId,
      payload: row?.payload ? parsePayloadText(row.payload) : null,
      createdAt: row?.created_at ?? null,
    };
  }

  throw new Error(`Unsupported pi-supervisor session resource: ${resource}`);
}

async function readAgentResource(
  ctx: ExtensionContext,
  agentId: number,
  parsed: ParsedSupervisorResourceUrl,
): Promise<unknown> {
  const agentStub = { id: agentId, homeDir: getAgentHomeDir(agentId) } as Agent;
  const skillPaths = ctx.db.available
    ? listAgentResourcePathsFromSqlite(ctx.db, agentId, "skill")
    : [];
  const promptPaths = ctx.db.available
    ? listAgentResourcePathsFromSqlite(ctx.db, agentId, "prompt")
    : [];
  const { skills } = loadSkills({
    cwd: ctx.project.cwd,
    skillPaths,
  });
  const promptTemplates = loadPromptTemplates({
    cwd: ctx.project.cwd,
    promptPaths,
  });
  const { readAgentHomeSystemPrompt } = await import("../agent/agent-paths.js");
  const systemMd = readAgentHomeSystemPrompt(agentStub.homeDir!);

  if (parsed.resource === "skills" && parsed.skillName) {
    const skill = skills.find((item) => item.name === parsed.skillName);
    if (!skill) {
      throw new Error(`Skill not found for agent ${agentId}: ${parsed.skillName}`);
    }
    const { readFileSync } = await import("node:fs");
    return {
      agentId,
      name: skill.name,
      description: skill.description,
      filePath: skill.filePath,
      content: readFileSync(skill.filePath, "utf-8"),
    };
  }

  if (parsed.resource === "prompts" && parsed.promptName) {
    const prompt = promptTemplates.find((item) => item.name === parsed.promptName);
    if (!prompt) {
      throw new Error(`Prompt not found for agent ${agentId}: ${parsed.promptName}`);
    }
    return {
      agentId,
      name: prompt.name,
      description: prompt.description,
      filePath: prompt.filePath,
      content: prompt.content,
    };
  }

  if (parsed.resource === "summary" || parsed.resource === "") {
    const tools = ctx.agent.listTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      source: tool.source,
      extensionName: tool.extensionName,
    }));
    return {
      agentId,
      name: agentId === ctx.agent.id ? ctx.agent.name : undefined,
      systemMd: systemMd || null,
      skills: skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        url: `pi-supervisor://agents/${agentId}/skills/${encodeURIComponent(skill.name)}`,
      })),
      prompts: promptTemplates.map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
        url: `pi-supervisor://agents/${agentId}/prompts/${encodeURIComponent(prompt.name)}`,
      })),
      packagedTools: ctx.db.available ? listAgentToolSlugsFromSqlite(ctx.db, agentId) : [],
      tools,
    };
  }

  if (parsed.resource.startsWith("tools/")) {
    const toolId = parsed.resource.slice("tools/".length);
    return {
      agentId,
      toolId,
      enabled: ctx.db.available
        ? listAgentToolSlugsFromSqlite(ctx.db, agentId).includes(toolId)
        : false,
    };
  }

  throw new Error(`Unsupported pi-supervisor agent resource: ${parsed.resource}`);
}

export async function readSupervisorResource(
  ctx: ExtensionContext,
  url: string,
  options?: { limit?: number },
): Promise<unknown> {
  const parsed = parseSupervisorResourceUrl(url);
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));

  if (parsed.kind === "session" && parsed.sessionId !== undefined) {
    await assertCanReadSession(ctx, parsed.sessionId);
    if (!ctx.db.available) {
      throw new Error("SQLite resource access is not available in this runtime");
    }
    return readSessionResource(ctx.db, parsed.sessionId, parsed.resource, limit);
  }

  if (parsed.kind === "agent" && parsed.agentId !== undefined) {
    await assertCanReadAgent(ctx, parsed.agentId);
    return readAgentResource(ctx, parsed.agentId, parsed);
  }

  throw new Error(`Unsupported pi-supervisor resource URL: ${url}`);
}
