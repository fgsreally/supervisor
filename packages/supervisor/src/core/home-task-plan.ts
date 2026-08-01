import type { HomeTask } from "../types.js";

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
      ? row.subagentIds
          .map(asPositiveInt)
          .filter((id): id is number => id != null)
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
  const agentLines = input.agents
    .map((agent) => `- id=${agent.id} name=${agent.name}`)
    .join("\n");

  return [
    "将用户 Todo 拆成可执行工作项依赖图。完成后必须调用 submit_result，result 形如：",
    '{"items":[{"key":"a","title":"...","prompt":"...","dependsOnKeys":[],"projectId":1,"agentId":2,"subagentIds":[3]}]}',
    "规则：",
    "- 2 到 12 个工作项",
    "- key 在本次结果内唯一，dependsOnKeys 引用其他 key；无环",
    "- 无依赖的项可并行；有依赖则为串行门禁",
    "- prompt 必须是子 agent 可直接开干的完整指令",
    "- projectId / agentId / subagentIds 尽量从下列候选中选择；不确定时 projectId 用根项目，agentId 可省略",
    "",
    `Todo 标题: ${input.title.slice(0, 200)}`,
    `Todo 说明: ${input.description.slice(0, 2000)}`,
    `根项目: ${
      input.project
        ? `id=${input.project.id} name=${input.project.name} cwd=${input.project.cwd}`
        : "(未绑定)"
    }`,
    "可选项目:",
    projectLines || "(无)",
    "可选 Agent:",
    agentLines || "(无)",
  ].join("\n");
}
