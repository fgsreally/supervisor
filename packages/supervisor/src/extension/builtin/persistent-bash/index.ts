import { Type } from "typebox";
import type { ExtensionDefinition } from "../../types.js";
import {
  getPersistentBashSession,
  listPersistentBashSessions,
  startPersistentBashSession,
  stopPersistentBashSessions,
} from "./manager.js";

export default {
  name: "persistent-bash",
  setup(ctx) {
    ctx.agent.registerTool({
      name: "PersistentBash",
      description:
        "Manage a background shell represented as a Session Job. Start commands without blocking, read persisted output, write stdin, list, or stop. Process execution ends when the Session or Supervisor stops.",
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal("start"),
          Type.Literal("list"),
          Type.Literal("read"),
          Type.Literal("write"),
          Type.Literal("stop"),
        ]),
        id: Type.Optional(Type.String()),
        command: Type.Optional(Type.String()),
        label: Type.Optional(Type.String()),
        input: Type.Optional(Type.String()),
        tailChars: Type.Optional(Type.Number({ minimum: 1, maximum: 200_000 })),
      }),
      async execute(params) {
        if (params.action === "start") {
          const item = await startPersistentBashSession({
            sessionId: ctx.session.id,
            cwd: ctx.session.cwd,
            jobs: ctx.jobs,
            command: params.command,
            label: params.label,
          });
          return { content: [{ type: "text", text: JSON.stringify(item) }], details: item };
        }
        if (params.action === "list") {
          const items = await listPersistentBashSessions(ctx.session.id, ctx.jobs);
          return { content: [{ type: "text", text: JSON.stringify(items) }], details: { items } };
        }
        if (!params.id) throw new Error(`PersistentBash action=${params.action} requires id`);
        if (params.action === "read") {
          const item = await getPersistentBashSession(
            ctx.session.id,
            params.id,
            ctx.jobs,
            params.tailChars,
          );
          if (!item) throw new Error(`Bash session ${params.id} not found`);
          return { content: [{ type: "text", text: item.output || "(no output)" }], details: item };
        }
        if (params.action === "write") {
          if (!params.input) throw new Error("PersistentBash action=write requires input");
          await ctx.jobs.input(params.id, params.input);
          return { content: [{ type: "text", text: `Wrote to Bash session ${params.id}` }] };
        }
        await ctx.jobs.cancel(params.id);
        const item = await getPersistentBashSession(ctx.session.id, params.id, ctx.jobs);
        return {
          content: [{ type: "text", text: item?.output || `Stopped ${params.id}` }],
          details: item,
        };
      },
    });
    return () => stopPersistentBashSessions(ctx.session.id, ctx.jobs);
  },
} satisfies ExtensionDefinition;
