import type { HomeTask } from "../types.js";
import { Type } from "typebox";

export const TodoPlanResultSchema = Type.Object({
  items: Type.Array(
    Type.Object({
      key: Type.String(),
      title: Type.String(),
      prompt: Type.String(),
      dependsOnKeys: Type.Array(Type.String()),
      projectId: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
      agentId: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
      subagentIds: Type.Optional(Type.Array(Type.Number())),
    }),
  ),
});

export interface TodoPlanItemDraft {
  key: string;
  title: string;
  prompt: string;
  dependsOnKeys: string[];
  projectId?: number | null;
  agentId?: number | null;
  subagentIds?: number[];
}

export interface TodoPlanResult {
  items: TodoPlanItemDraft[];
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Parse Watson submit_result payload into plan drafts. */
export function parseTodoPlanResult(raw: unknown): TodoPlanItemDraft[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("华生规划结果无效");
  }
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("华生未返回可执行工作项");
  }

  const drafts: TodoPlanItemDraft[] = [];
  const seenKeys = new Set<string>();

  for (const item of items.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = asString(row.key);
    const title = asString(row.title).slice(0, 120);
    const prompt = asString(row.prompt).slice(0, 4000);
    if (!key || !title || !prompt) continue;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const dependsOnKeys = Array.isArray(row.dependsOnKeys)
      ? row.dependsOnKeys
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

    const subagentIds = Array.isArray(row.subagentIds)
      ? row.subagentIds.map(asPositiveInt).filter((id): id is number => id != null)
      : [];

    drafts.push({
      key,
      title,
      prompt,
      dependsOnKeys,
      projectId:
        row.projectId === null || row.projectId === undefined
          ? row.projectId === null
            ? null
            : undefined
          : asPositiveInt(row.projectId),
      agentId:
        row.agentId === null || row.agentId === undefined
          ? row.agentId === null
            ? null
            : undefined
          : asPositiveInt(row.agentId),
      subagentIds,
    });
  }

  if (drafts.length < 2) {
    throw new Error("规划至少需要 2 个工作项");
  }

  const keySet = new Set(drafts.map((item) => item.key));
  for (const draft of drafts) {
    draft.dependsOnKeys = draft.dependsOnKeys.filter((key) => keySet.has(key) && key !== draft.key);
  }

  assertNoCycles(
    drafts.map((item) => ({
      id: item.key,
      dependsOn: item.dependsOnKeys,
    })),
  );

  return drafts;
}

export function assertNoCycles(
  nodes: Array<{ id: string | number; dependsOn: Array<string | number> }>,
): void {
  const byId = new Map(nodes.map((node) => [String(node.id), node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error("工作项依赖存在环");
    visiting.add(id);
    const node = byId.get(id);
    for (const dep of node?.dependsOn ?? []) {
      const depId = String(dep);
      if (!byId.has(depId)) continue;
      visit(depId);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const node of nodes) visit(String(node.id));
}

/** Validate sibling dependency graph (ids must refer to siblings). */
export function validateHomeTaskDependencies(children: HomeTask[]): void {
  const ids = new Set(children.map((child) => child.id));
  for (const child of children) {
    for (const dep of child.dependsOn) {
      if (!ids.has(dep)) {
        throw new Error(`工作项 ${child.id} 依赖了无效前置 ${dep}`);
      }
      if (dep === child.id) {
        throw new Error(`工作项 ${child.id} 不能依赖自己`);
      }
    }
  }
  assertNoCycles(
    children.map((child) => ({
      id: child.id,
      dependsOn: child.dependsOn,
    })),
  );
}

export function listReadyHomeTaskChildren(children: HomeTask[]): HomeTask[] {
  const byId = new Map(children.map((child) => [child.id, child]));
  return children.filter((child) => {
    if (child.sessionId != null) return false;
    if (child.status !== "todo" && child.status !== "backlog") return false;
    return child.dependsOn.every((depId) => byId.get(depId)?.status === "done");
  });
}

export function buildTodoPlanPrompt(input: {
  title: string;
  description: string;
  project: { id: number; name: string; cwd: string } | null;
  projects: Array<{ id: number; name: string; cwd: string }>;
  agents: Array<{ id: number; name: string }>;
}): string {
  const projectLines = input.projects
    .map((project) => `- id=${project.id} name=${project.name} cwd=${project.cwd}`)
    .join("\n");
  const agentLines = input.agents.map((agent) => `- id=${agent.id} name=${agent.name}`).join("\n");

  return [
    "Break the user's Todo into an executable dependency graph of work items. You must call submit_result when finished; the result has this shape:",
    '{"items":[{"key":"a","title":"...","prompt":"...","dependsOnKeys":[],"projectId":1,"agentId":2,"subagentIds":[3]}]}',
    "Rules:",
    "- Produce 2 to 12 work items.",
    "- Keys must be unique within this result; dependsOnKeys must reference other keys and contain no cycles.",
    "- Items without dependencies may run in parallel; dependencies are sequential gates.",
    "- Each prompt must be a complete instruction that a child Agent can execute directly.",
    "- Prefer projectId, agentId, and subagentIds from the candidates below; use the root project when unsure and omit agentId when appropriate.",
    "",
    `Todo title: ${input.title.slice(0, 200)}`,
    `Todo description: ${input.description.slice(0, 2000)}`,
    `Root project: ${
      input.project
        ? `id=${input.project.id} name=${input.project.name} cwd=${input.project.cwd}`
        : "(unbound)"
    }`,
    "Available projects:",
    projectLines || "(none)",
    "Available Agents:",
    agentLines || "(none)",
  ].join("\n");
}
