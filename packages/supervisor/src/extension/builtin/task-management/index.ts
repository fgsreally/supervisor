import { Type } from "typebox";
import {
  activeTaskPaths,
  readTaskArtifact,
  taskArtifactPath,
  writeTaskArtifact,
} from "../../../core/task-artifacts.js";
import { parseSessionTodos, renderSessionTodos } from "../../../core/session-todos.js";
import type { ExtensionDefinition } from "../../types.js";

type Todo = { title: string; status: "pending" | "in_progress" | "done" };

const taskManagementExtension: ExtensionDefinition = {
  name: "task-management",
  async setup(ctx) {
    const initialMeta = await ctx.session.meta.get();
    let planPath = activeTaskPaths(initialMeta).find((path) => path.includes("/plan-")) ?? null;
    const setActive = async (path: string) => {
      const meta = await ctx.session.meta.get();
      const tasks = [...new Set([...activeTaskPaths(meta), path])];
      await ctx.session.meta.patch({ tasks, currentTask: path });
    };
    const finish = async (path: string) => {
      const meta = await ctx.session.meta.get();
      const tasks = activeTaskPaths(meta).filter((item) => item !== path);
      await ctx.session.meta.patch({
        tasks,
        currentTask: meta.currentTask === path ? (tasks.at(-1) ?? null) : meta.currentTask,
      });
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
        const meta = await ctx.session.meta.get();
        if (params.todos === undefined) {
          return {
            content: [{ type: "text", text: renderSessionTodos(parseSessionTodos(meta.todos)) }],
          };
        }
        const todos = parseSessionTodos(params.todos);
        await ctx.session.meta.patch({ todos });
        return { content: [{ type: "text", text: renderSessionTodos(todos) }] };
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
      async execute(params: { action: string; objective?: string; reason?: string }) {
        const meta = await ctx.session.meta.get();
        let path = activeTaskPaths(meta).find((item) => item.includes("/goal-"));
        if (params.action === "create") {
          if (!params.objective) throw new Error("objective is required");
          if (path) throw new Error("An active Goal already exists");
          path = taskArtifactPath("goal");
          await writeTaskArtifact(ctx.session.dir, path, {
            type: "goal",
            title: params.objective.split("\n")[0]!.slice(0, 120),
            status: "active",
            body: `# Goal\n\n${params.objective}`,
          });
          await setActive(path);
          return { content: [{ type: "text", text: `Goal created: ${path}` }], details: { path } };
        }
        if (!path)
          return {
            content: [{ type: "text", text: "No active Goal." }],
            isError: params.action !== "status",
          };
        const artifact = await readTaskArtifact(ctx.session.dir, path);
        if (!artifact)
          return { content: [{ type: "text", text: "Goal file is missing." }], isError: true };
        if (params.action === "status")
          return { content: [{ type: "text", text: artifact.content }], details: { path } };
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
        await writeTaskArtifact(ctx.session.dir, path, {
          type: "goal",
          title: artifact.title,
          status,
          body,
        });
        if (status === "completed" || status === "cancelled") await finish(path);
        return { content: [{ type: "text", text: `Goal ${status}: ${path}` }], details: { path } };
      },
    });

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
        await setActive(planPath);
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
