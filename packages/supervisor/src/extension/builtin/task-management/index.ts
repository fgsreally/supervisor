import { Type } from "typebox";
import {
  readTaskArtifact,
  taskArtifactPath,
  writeTaskArtifact,
} from "../../../core/tasks/task-artifacts.js";
import { parseSessionTodos, renderSessionTodos } from "../../../core/session/session-todos.js";
import type { ExtensionContext, ExtensionDefinition } from "../../types.js";

type Todo = {
  id?: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  dependsOn?: string[];
  sessionId?: number;
};
type TaskStage = "todo" | "plan:planning" | "plan:executing" | "goal:active";

const TASK_TOOL_NAMES = new Set([
  "TodoList",
  "Goal",
  "EnterPlanMode",
  "UpdatePlan",
  "ExitPlanMode",
  "CompletePlan",
]);
const FINISHED = new Set(["completed", "cancelled"]);

function isTaskStage(stage: string | null | undefined): stage is TaskStage {
  return (
    stage === "todo" ||
    stage === "plan:planning" ||
    stage === "plan:executing" ||
    stage === "goal:active"
  );
}

function visibleTaskTools(stage: string | null): Set<string> {
  if (stage === "plan:planning") return new Set(["UpdatePlan", "ExitPlanMode"]);
  if (stage === "plan:executing") return new Set(["TodoList", "CompletePlan"]);
  if (stage === "goal:active") return new Set(["TodoList", "Goal"]);
  return new Set(["TodoList", "Goal", "EnterPlanMode"]);
}

const todoExtension: ExtensionDefinition = {
  name: "task-management",
  async setup(ctx) {
    let stage = (await ctx.session.workflow.get())?.stage ?? null;
    let planPath = await findCurrentTaskPath(ctx, "plan");

    const setStage = async (next: TaskStage | null) => {
      stage = next;
      if (next) await ctx.session.workflow.set({ stage: next });
      else if (isTaskStage((await ctx.session.workflow.get())?.stage))
        await ctx.session.workflow.clear();
      await applyToolStage(ctx, next);
    };

    ctx.session.tools.beforeUse(
      (call) => {
        if (stage !== "plan:planning") return;
        if (call.name === "write" || call.name === "edit" || call.name === "bash") {
          return {
            allow: false,
            reason: "Plan discussion is read-only. Approve the plan before execution.",
          };
        }
      },
      { priority: 1_000 },
    );

    ctx.agent.registerTool({
      name: "TodoList",
      description:
        "Read or replace the visible Session todo list. Use this to track concrete execution steps.",
      parameters: Type.Object({
        todos: Type.Optional(
          Type.Array(
            Type.Object({
              title: Type.String({ minLength: 1 }),
              id: Type.Optional(Type.String({ minLength: 1 })),
              dependsOn: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
              sessionId: Type.Optional(Type.Number()),
              status: Type.Union([
                Type.Literal("pending"),
                Type.Literal("in_progress"),
                Type.Literal("completed"),
                Type.Literal("cancelled"),
              ]),
            }),
          ),
        ),
      }),
      async execute(params: { todos?: Todo[] }) {
        if (params.todos === undefined) {
          return {
            content: [
              {
                type: "text" as const,
                text: renderSessionTodos(
                  (await ctx.session.todos.list()).map((todo) => ({
                    id: todo.taskKey ?? undefined,
                    title: todo.title,
                    status: todo.status,
                    dependsOn: todo.dependsOn,
                    sessionId: todo.childSessionId ?? undefined,
                  })),
                ),
              },
            ],
          };
        }
        const saved = await ctx.session.todos.replace(parseSessionTodos(params.todos));
        if (!stage && saved.some((todo) => !FINISHED.has(todo.status))) await setStage("todo");
        else if (stage === "todo" && saved.every((todo) => FINISHED.has(todo.status)))
          await setStage(null);
        return {
          content: [
            {
              type: "text" as const,
              text: renderSessionTodos(
                saved.map((todo) => ({
                  id: todo.taskKey ?? undefined,
                  title: todo.title,
                  status: todo.status,
                  dependsOn: todo.dependsOn,
                  sessionId: todo.childSessionId ?? undefined,
                })),
              ),
            },
          ],
        };
      },
    });

    ctx.agent.registerTool({
      name: "Goal",
      description:
        "Create, inspect, pause, resume, complete, block, switch, or delete a persistent Goal.",
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal("create"),
          Type.Literal("status"),
          Type.Literal("list"),
          Type.Literal("pause"),
          Type.Literal("resume"),
          Type.Literal("complete"),
          Type.Literal("blocked"),
          Type.Literal("switch"),
          Type.Literal("delete"),
        ]),
        objective: Type.Optional(Type.String({ minLength: 1 })),
        path: Type.Optional(Type.String()),
        reason: Type.Optional(Type.String()),
      }),
      async execute(params: {
        action: string;
        objective?: string;
        path?: string;
        reason?: string;
      }) {
        return executeGoal(ctx, params, setStage);
      },
    });

    ctx.agent.registerTool({
      name: "EnterPlanMode",
      description:
        "Enter the read-only Plan discussion stage and create a Session-owned Plan Markdown.",
      parameters: Type.Object({}),
      async execute() {
        const workflowStage = (await ctx.session.workflow.get())?.stage;
        if (workflowStage && !isTaskStage(workflowStage))
          return error(`Session stage ${workflowStage} is controlled by another workflow.`);
        planPath = taskArtifactPath("plan");
        await writeTaskArtifact(ctx.session.dir, planPath, {
          type: "plan",
          title: "Implementation plan",
          status: "planning",
          body: "# Implementation plan\n\nDescribe the approach, affected areas, risks, verification, and ordered execution steps.",
        });
        await activateTask(ctx, planPath, "plan", "Implementation plan", "planning");
        await setStage("plan:planning");
        ctx.inject.schedule({
          variant: "plan-discussion",
          content: `Plan discussion stage is active. Explore read-only, then call UpdatePlan with the complete Markdown plan for ${planPath}. When ready, call ExitPlanMode.`,
          priority: 1_000,
          dedupeAfterTurns: 0,
        });
        return {
          content: [{ type: "text" as const, text: `Plan discussion started: ${planPath}` }],
          details: { path: planPath },
        };
      },
    });

    ctx.agent.registerTool({
      name: "UpdatePlan",
      description: "Replace the current Session-owned Plan Markdown during plan discussion.",
      parameters: Type.Object({
        markdown: Type.String({ minLength: 1 }),
        title: Type.Optional(Type.String({ minLength: 1 })),
      }),
      async execute(params: { markdown: string; title?: string }) {
        if (stage !== "plan:planning" || !planPath) return error("Plan mode is not active.");
        const current = await readTaskArtifact(ctx.session.dir, planPath);
        const title = params.title?.trim() || current?.title || "Implementation plan";
        await writeTaskArtifact(ctx.session.dir, planPath, {
          type: "plan",
          title,
          status: "planning",
          body: stripFrontmatter(params.markdown),
        });
        await activateTask(ctx, planPath, "plan", title, "planning");
        return {
          content: [{ type: "text" as const, text: `Plan updated: ${planPath}` }],
          details: { path: planPath },
        };
      },
    });

    ctx.agent.registerTool({
      name: "ExitPlanMode",
      description:
        "Submit the current Plan Markdown for approval and enter execution after approval.",
      parameters: Type.Object({}),
      async execute() {
        if (!planPath) return error("Plan mode is not active.");
        const artifact = await readTaskArtifact(ctx.session.dir, planPath);
        if (!artifact) return error("Plan file is missing.");
        const result = await ctx.ui.requestApproval({
          kind: "plan_review",
          title: artifact.title,
          body: artifact.content,
          actions: ["approve", "revise", "reject"],
        });
        if (result.action === "revise") {
          ctx.inject.schedule({
            variant: "plan-revision",
            content: `Revise the current plan using this feedback:\n${result.feedback}`,
            priority: 1_000,
            dedupeAfterTurns: 0,
          });
          return { content: [{ type: "text" as const, text: "Plan returned for revision." }] };
        }
        if (result.action === "reject")
          return error("Plan rejected; discussion stage remains active.");
        await writeTaskArtifact(ctx.session.dir, planPath, {
          type: "plan",
          title: artifact.title,
          status: "executing",
          body: stripFrontmatter(artifact.content),
        });
        await activateTask(ctx, planPath, "plan", artifact.title, "executing");
        await setStage("plan:executing");
        ctx.inject.schedule({
          variant: "plan-execution",
          content:
            "The plan was approved. Convert its ordered execution steps into TodoList, then execute them. Call CompletePlan only after every required step and verification is complete.",
          priority: 1_000,
          dedupeAfterTurns: 0,
        });
        return {
          content: [{ type: "text" as const, text: "Plan approved; execution stage started." }],
          details: { path: planPath },
        };
      },
    });

    ctx.agent.registerTool({
      name: "CompletePlan",
      description: "Complete the executing Plan after its TodoList and verification are finished.",
      parameters: Type.Object({}),
      async execute() {
        if (stage !== "plan:executing" || !planPath) return error("No Plan is executing.");
        const todos = await ctx.session.todos.list();
        if (todos.some((todo) => todo.status === "pending" || todo.status === "in_progress")) {
          return error("Plan still has unfinished Todo items.");
        }
        const artifact = await readTaskArtifact(ctx.session.dir, planPath);
        if (artifact)
          await writeTaskArtifact(ctx.session.dir, planPath, {
            type: "plan",
            title: artifact.title,
            status: "completed",
            body: stripFrontmatter(artifact.content),
          });
        await ctx.session.tasks.upsert({
          path: planPath,
          kind: "plan",
          title: artifact?.title,
          status: "completed",
        });
        await ctx.session.tasks.setCurrentPath(null);
        planPath = null;
        await setStage(null);
        return { content: [{ type: "text" as const, text: "Plan completed." }] };
      },
    });

    ctx.agent.registerSlash("plan", {
      description: "Enter read-only Plan discussion",
      source: "custom",
      icon: "map",
      arguments: { type: "none" },
      handler: async () => {
        const result = await ctx.tools.call("EnterPlanMode", {});
        return result.isError
          ? { type: "error", message: toolText(result) }
          : { type: "handled", message: toolText(result) };
      },
    });
    ctx.agent.registerSlash("goal", {
      description: "Create or inspect a persistent Goal",
      source: "custom",
      icon: "target",
      arguments: {
        type: "text",
        required: false,
        placeholder: "Describe the goal or use status/list",
      },
      handler: async (args) => {
        const text = args.trim();
        const action = text === "status" || text === "list" ? text : text ? "create" : "status";
        const result = await ctx.tools.call("Goal", {
          action,
          ...(action === "create" ? { objective: text } : {}),
        });
        return result.isError
          ? { type: "error", message: toolText(result) }
          : { type: "handled", message: toolText(result) };
      },
    });

    stage = (await ctx.session.workflow.get())?.stage ?? null;
    if (stage === "goal:active") {
      await ctx.flow.pause("Goal restored paused after process restart");
      const task = await currentTask(ctx, "goal");
      if (task) {
        await ctx.session.tasks.upsert({ ...taskInput(task), status: "paused" });
        const artifact = await readTaskArtifact(ctx.session.dir, task.path);
        if (artifact)
          await writeTaskArtifact(ctx.session.dir, task.path, {
            type: "goal",
            title: artifact.title,
            status: "paused",
            body: stripFrontmatter(artifact.content),
          });
      }
      await ctx.session.workflow.clear();
      stage = null;
    }
    if (isTaskStage(stage)) await applyToolStage(ctx, stage);

    ctx.on("turn.ended", async () => {
      if (stage !== "goal:active") return;
      const current = await currentTask(ctx, "goal");
      if (!current || current.status !== "active") return;
      await ctx.flow.continue({
        prompt:
          "Continue working toward the active Goal. Review the current TodoList, advance one coherent slice, update TodoList as needed, and call Goal with complete or blocked only when justified.",
        origin: "goal",
        dedupeKey: `goal:${current.path}`,
      });
    });

    if (isTaskStage(stage)) await applyToolStage(ctx, stage);
  },
};

async function applyToolStage(ctx: ExtensionContext, stage: string | null): Promise<void> {
  const visible = visibleTaskTools(stage);
  const activate: string[] = [];
  const deactivate: string[] = [];
  for (const name of TASK_TOOL_NAMES) {
    if (visible.has(name)) activate.push(name);
    else deactivate.push(name);
  }
  if (deactivate.length) await ctx.agent.deactivate(deactivate);
  if (activate.length) await ctx.agent.activate(activate);
}

async function executeGoal(
  ctx: ExtensionContext,
  params: { action: string; objective?: string; path?: string; reason?: string },
  setStage: (stage: TaskStage | null) => Promise<void>,
) {
  const tasks = (await ctx.session.tasks.list()).filter((task) => task.kind === "goal");
  if (params.action === "list") {
    return {
      content: [
        {
          type: "text" as const,
          text: tasks.length
            ? tasks
                .map((task) => `${task.path} [${task.status}] ${task.title ?? "Goal"}`)
                .join("\n")
            : "No Goals.",
        },
      ],
    };
  }
  if (params.action === "create") {
    if (!params.objective?.trim()) return error("objective is required");
    const workflowStage = (await ctx.session.workflow.get())?.stage;
    if (workflowStage && !isTaskStage(workflowStage))
      return error(`Session stage ${workflowStage} is controlled by another workflow.`);
    const current = await currentTask(ctx, "goal");
    if (current?.status === "active")
      await ctx.session.tasks.upsert({ ...taskInput(current), status: "paused" });
    const path = taskArtifactPath("goal");
    const title = params.objective.trim().split("\n")[0]!.slice(0, 120);
    await writeTaskArtifact(ctx.session.dir, path, {
      type: "goal",
      title,
      status: "active",
      body: `# Goal\n\n${params.objective.trim()}\n\n## Completion criteria\n\nComplete only when the requested end state is verified.`,
    });
    await activateTask(ctx, path, "goal", title, "active");
    await ctx.flow.resume();
    await setStage("goal:active");
    ctx.inject.schedule({
      variant: "goal-control",
      content: `An active Goal is now running:\n${params.objective.trim()}\nUse TodoList for concrete steps. Continue until verified complete or genuinely blocked.`,
      priority: 1_000,
      dedupeAfterTurns: 0,
    });
    return {
      content: [{ type: "text" as const, text: `Goal created: ${path}` }],
      details: { path },
    };
  }
  const task = params.path
    ? tasks.find((item) => item.path === params.path)
    : await currentTask(ctx, "goal");
  if (!task) return error("Goal not found.");
  if (params.action === "status") {
    const artifact = await readTaskArtifact(ctx.session.dir, task.path);
    return {
      content: [
        { type: "text" as const, text: artifact?.content ?? `${task.title} [${task.status}]` },
      ],
      details: { path: task.path },
    };
  }
  if (params.action === "delete") {
    await ctx.session.tasks.remove(task.path);
    if ((await ctx.session.tasks.getCurrentPath()) === task.path) {
      await ctx.session.tasks.setCurrentPath(null);
      await setStage(null);
    }
    return { content: [{ type: "text" as const, text: `Goal deleted: ${task.path}` }] };
  }
  const status =
    params.action === "switch" || params.action === "resume"
      ? "active"
      : params.action === "pause"
        ? "paused"
        : params.action === "blocked"
          ? "blocked"
          : params.action === "complete"
            ? "completed"
            : null;
  if (!status) return error(`Unknown Goal action: ${params.action}`);
  if (status === "active") {
    const workflowStage = (await ctx.session.workflow.get())?.stage;
    if (workflowStage && !isTaskStage(workflowStage))
      return error(`Session stage ${workflowStage} is controlled by another workflow.`);
    const current = await currentTask(ctx, "goal");
    if (current && current.path !== task.path && current.status === "active")
      await ctx.session.tasks.upsert({ ...taskInput(current), status: "paused" });
    await ctx.session.tasks.setCurrentPath(task.path);
    await ctx.flow.resume();
    await setStage("goal:active");
  }
  await ctx.session.tasks.upsert({ ...taskInput(task), status });
  const artifact = await readTaskArtifact(ctx.session.dir, task.path);
  if (artifact)
    await writeTaskArtifact(ctx.session.dir, task.path, {
      type: "goal",
      title: artifact.title,
      status,
      body:
        stripFrontmatter(artifact.content) +
        (params.reason ? `\n\n## Status reason\n\n${params.reason}` : ""),
    });
  if (FINISHED.has(status) || status === "paused" || status === "blocked") {
    await ctx.flow.pause(params.reason ?? status);
    if (FINISHED.has(status) && (await ctx.session.tasks.getCurrentPath()) === task.path)
      await ctx.session.tasks.setCurrentPath(null);
    await setStage(null);
  }
  return {
    content: [{ type: "text" as const, text: `Goal ${status}: ${task.path}` }],
    details: { path: task.path },
  };
}

async function activateTask(
  ctx: ExtensionContext,
  path: string,
  kind: "goal" | "plan",
  title: string,
  status: string,
) {
  await ctx.session.tasks.upsert({ path, kind, title, status });
  await ctx.session.tasks.setCurrentPath(path);
}
async function currentTask(ctx: ExtensionContext, kind: "goal" | "plan") {
  const path = await ctx.session.tasks.getCurrentPath();
  return (await ctx.session.tasks.list()).find((task) => task.path === path && task.kind === kind);
}
async function findCurrentTaskPath(ctx: ExtensionContext, kind: "goal" | "plan") {
  return (await currentTask(ctx, kind))?.path ?? null;
}
function taskInput(task: { path: string; kind: "goal" | "plan"; title: string | null }) {
  return { path: task.path, kind: task.kind, title: task.title };
}
function stripFrontmatter(content: string) {
  return content.replace(/^---[\s\S]*?---\s*/m, "").trim();
}
function error(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}
function toolText(result: { content: Array<{ type: "text"; text: string } | { type: "image" }> }) {
  return result.content
    .filter((item): item is { type: "text"; text: string } => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

export default todoExtension;
