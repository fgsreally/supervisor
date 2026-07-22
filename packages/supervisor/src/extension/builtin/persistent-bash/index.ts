import { Type } from "typebox";
import type { ExtensionDefinition } from "../../types.js";
import {
  getPersistentBashSession,
  listPersistentBashSessions,
  startPersistentBashSession,
  stopPersistentBashSession,
  stopPersistentBashSessions,
  writePersistentBashSession,
} from "./manager.js";

export default {
  name: "persistent-bash",
  setup(ctx) {
    ctx.agent.registerTool({
      name: "PersistentBash",
      description:
        "Manage an in-memory long-running shell for this Session. Start commands without blocking, read output, write stdin, list, or stop. Shells end when the Session or Supervisor stops.",
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
          const item = startPersistentBashSession({
            sessionId: ctx.session.id,
            cwd: ctx.session.cwd,
            command: params.command,
            label: params.label,
          });
          return { content: [{ type: "text", text: JSON.stringify(item) }], details: item };
        }
        if (params.action === "list") {
          const items = listPersistentBashSessions(ctx.session.id);
          return { content: [{ type: "text", text: JSON.stringify(items) }], details: { items } };
        }
        if (!params.id) throw new Error(`PersistentBash action=${params.action} requires id`);
        if (params.action === "read") {
          const item = getPersistentBashSession(ctx.session.id, params.id, params.tailChars);
          if (!item) throw new Error(`Bash session ${params.id} not found`);
          return { content: [{ type: "text", text: item.output || "(no output)" }], details: item };
        }
        if (params.action === "write") {
          if (!params.input) throw new Error("PersistentBash action=write requires input");
          writePersistentBashSession(ctx.session.id, params.id, params.input);
          return { content: [{ type: "text", text: `Wrote to Bash session ${params.id}` }] };
        }
        await stopPersistentBashSession(ctx.session.id, params.id);
        const item = getPersistentBashSession(ctx.session.id, params.id);
        return {
          content: [{ type: "text", text: item?.output || `Stopped ${params.id}` }],
          details: item,
        };
      },
    });
    return () => stopPersistentBashSessions(ctx.session.id);
  },
} satisfies ExtensionDefinition;
