import { Type } from "typebox";
import { readTaskArtifact, taskArtifactPath, writeTaskArtifact } from "../../../core/task-artifacts.js";
import { parseSessionTodos, renderSessionTodos } from "../../../core/session-todos.js";
import type { ExtensionDefinition } from "../../types.js";

type Todo = { title: string; status: "pending" | "in_progress" | "done" };

const FINISHED_GOAL_STATUSES = new Set(["completed", "cancelled"]);

type GoalResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: { path: string };
  isError?: boolean;
};

const taskManagementExtension: ExtensionDefinition = {
  name: "task-management",
  async setup(ctx) {
    const initialTasks = await ctx.session.tasks.list();
    let planPath =
      initialTasks.find((task) => task.kind === "plan" && task.status !== "completed")?.path ??
      null;

    const setActive = async (
      path: string,
      kind: "goal" | "plan",
      title: string,
      status: string,
    ) => {
      await ctx.session.tasks.upsert({ path, kind, title, status });
      await ctx.session.tasks.setCurrentPath(path);
    };
    const finish = async (path: string) => {
      const current = await ctx.session.tasks.getCurrentPath();
      if (current === path) await ctx.session.tasks.setCurrentPath(null);
    };

    ctx.session.tools.beforeUse((call) => {
      if (!planPath || (call.name !== "write" && call.name !== "edit")) return;
      const args = call.args as Record<string, unknown>;
      const path = typeof args.path === "string" ? args.path.replaceAll("\\", "/") : "";
      if (path.endsWith(planPath)) return { allow: true };
      return { allow: false, reason: `Plan mode is read-only except for ${planPath}` };
    });

    ctx.agent.registerTool({
      name: "TodoList",
      description:
        "Read or replace the Session todo list. The list is structured Agent-managed state, not a Markdown artifact.",
      parameters: Type.Object({
        todos: Type.Optional(
          Type.Array(
            Type.Object({
              title: Type.String({ minLength: 1 }),
              status: Type.Union([
                Type.Literal("pending"),
                Type.Literal("in_progress"),
                Type.Literal("done"),
              ]),
            }),
          ),
        ),
      }),
      async execute(params: { todos?: Todo[] }) {
        if (params.todos === undefined) {
          const todos = await ctx.session.todos.list();
          return {
            content: [{ type: "text" as const, text: renderSessionTodos(todos) }],
          };
        }
        const todos = parseSessionTodos(params.todos);
        const saved = await ctx.session.todos.replace(todos);
        return { content: [{ type: "text" as const, text: renderSessionTodos(saved) }] };
      },
    });

    ctx.agent.registerTool({
      name: "Goal",
      description:
        "Create and manage the active Goal Markdown. Use this when the user asks for /goal or a persistent stop-condition goal. The Web UI never writes Goal state.",
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal("create"),
          Type.Literal("status"),
          Type.Literal("pause"),
          Type.Literal("resume"),
          Type.Literal("complete"),
          Type.Literal("blocked"),
          Type.Literal("cancel"),
        ]),
        objective: Type.Optional(Type.String({ minLength: 1 })),
        reason: Type.Optional(Type.String()),
      }),
      execute: executeGoal,
    });

    ctx.agent.registerSlash("goal", {
      description: "Create or inspect a persistent goal",
      source: "custom",
      icon: "target",
      arguments: { type: "text", required: false, placeholder: "Describe the goal or action" },
      async handler(args) {
        const trimmed = args.trim();
        const [first = "", ...rest] = trimmed.split(/\s+/);
        const actions = new Set(["status", "pause", "resume", "complete", "blocked", "cancel"]);
        const action = actions.has(first) ? first : trimmed ? "create" : "status";
        const tail = actions.has(first) ? rest.join(" ") : trimmed;
        const result = await executeGoal({
          action,
          objective: action === "create" ? tail : undefined,
          reason: action === "pause" || action === "blocked" ? tail || undefined : undefined,
        });
        const text = result.content
          .filter((item): item is { type: "text"; text: string } => item.type === "text")
          .map((item) => item.text)
          .join("\n");
        if ("isError" in result && result.isError) return { type: "error", message: text };
        return { type: "handled", message: text };
      },
    });

    ctx.agent.registerSlash("plan", {
      description: "Enter plan mode and create a Session-owned Markdown plan",
      source: "custom",
      icon: "map",
      arguments: { type: "none" },
      async handler() {
        if (planPath) {
          return {
            type: "handled",
            message: `Plan mode is already active: ${planPath}`,
          };
        }
        planPath = taskArtifactPath("plan");
        await writeTaskArtifact(ctx.session.dir, planPath, {
          type: "plan",
          title: "Implementation plan",
          status: "planning",
          body: "# Implementation plan\n\nWrite the plan here.",
        });
        await setActive(planPath, "plan", "Implementation plan", "planning");
        return {
          type: "handled",
          message: `Plan mode active. Write the plan to ${planPath}, then call ExitPlanMode.`,
        };
      },
    });

    async function executeGoal(params: {
      action: string;
      objective?: string;
      reason?: string;
    }): Promise<GoalResult> {
      const tasks = await ctx.session.tasks.list();
      const task = tasks.find(
        (item) => item.kind === "goal" && !FINISHED_GOAL_STATUSES.has(item.status ?? ""),
      );
      if (params.action === "create") {
        if (!params.objective) throw new Error("objective is required");
        if (task) throw new Error("An active Goal already exists");
        const path = taskArtifactPath("goal");
        const title = params.objective.split("\n")[0]!.slice(0, 120);
        await writeTaskArtifact(ctx.session.dir, path, {
          type: "goal",
          title,
          status: "active",
          body: `# Goal\n\n${params.objective}`,
        });
        await setActive(path, "goal", title, "active");
        return { content: [{ type: "text", text: `Goal created: ${path}` }], details: { path } };
      }
      if (!task) {
        return {
          content: [{ type: "text", text: "No active Goal." }],
          isError: params.action !== "status",
        };
      }
      const artifact = await readTaskArtifact(ctx.session.dir, task.path);
      if (!artifact) {
        return { content: [{ type: "text", text: "Goal file is missing." }], isError: true };
      }
      if (params.action === "status") {
        return { content: [{ type: "text", text: artifact.content }], details: { path: task.path } };
      }
      const status = {
        pause: "paused",
        resume: "active",
        complete: "completed",
        blocked: "blocked",
        cancel: "cancelled",
      }[params.action]!;
      const body =
        artifact.content.replace(/^---[\s\S]*?---\s*/m, "") +
        (params.reason ? `\n\n## Status reason\n\n${params.reason}` : "");
      await writeTaskArtifact(ctx.session.dir, task.path, {
        type: "goal",
        title: artifact.title,
        status,
        body,
      });
      await ctx.session.tasks.upsert({
        path: task.path,
        kind: "goal",
        title: artifact.title,
        status,
      });
      if (FINISHED_GOAL_STATUSES.has(status)) await finish(task.path);
      return {
        content: [{ type: "text", text: `Goal ${status}: ${task.path}` }],
        details: { path: task.path },
      };
    }

    ctx.agent.registerTool({
      name: "EnterPlanMode",
      description: "Enter read-only plan mode and create a Session-owned Markdown plan file.",
      parameters: Type.Object({}),
      async execute() {
        if (planPath)
          return {
            content: [{ type: "text", text: `Plan mode is already active: ${planPath}` }],
            isError: true,
          };
        planPath = taskArtifactPath("plan");
        await writeTaskArtifact(ctx.session.dir, planPath, {
          type: "plan",
          title: "Implementation plan",
          status: "planning",
          body: "# Implementation plan\n\nWrite the plan here.",
        });
        await setActive(planPath, "plan", "Implementation plan", "planning");
        return {
          content: [
            {
              type: "text",
              text: `Plan mode active. Write the plan to ${planPath}, then call ExitPlanMode.`,
            },
          ],
          details: { path: planPath },
        };
      },
    });

    ctx.agent.registerTool({
      name: "ExitPlanMode",
      description:
        "Present the current plan Markdown for user review and exit plan mode after approval.",
      parameters: Type.Object({}),
      async execute() {
        if (!planPath)
          return { content: [{ type: "text", text: "Plan mode is not active." }], isError: true };
        const artifact = await readTaskArtifact(ctx.session.dir, planPath);
        if (!artifact)
          return { content: [{ type: "text", text: "Plan file is missing." }], isError: true };
        const result = await ctx.ui.requestApproval({
          kind: "plan_review",
          title: artifact.title,
          body: artifact.content,
          actions: ["approve", "revise", "reject"],
        });
        if (result.action === "revise")
          return { content: [{ type: "text", text: `Revise the plan: ${result.feedback}` }] };
        if (result.action === "reject")
          return {
            content: [{ type: "text", text: "Plan rejected; plan mode remains active." }],
            isError: true,
          };
        const completedPath = planPath;
        await writeTaskArtifact(ctx.session.dir, completedPath, {
          type: "plan",
          title: artifact.title,
          status: "completed",
          body: artifact.content.replace(/^---[\s\S]*?---\s*/m, ""),
        });
        await ctx.session.tasks.upsert({
          path: completedPath,
          kind: "plan",
          title: artifact.title,
          status: "completed",
        });
        await finish(completedPath);
        planPath = null;
        return {
          content: [{ type: "text", text: "Plan approved. Plan mode exited." }],
          details: { path: completedPath },
        };
      },
    });
  },
};

export default taskManagementExtension;
