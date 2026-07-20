import { Type, type Static } from "typebox";
import type { AgentResource } from "../../../agent/runtime-resources.js";
import type { ExtensionDefinition } from "../../types.js";

const skillSchema = Type.Object({
  name: Type.String({ description: "Skill name from <available_skills>" }),
  arguments: Type.Optional(
    Type.String({ description: "Arguments or task context passed when activating the skill" }),
  ),
  path: Type.Optional(
    Type.String({
      description:
        "Relative path inside the skill. A directory lists its entries; a file reads its text.",
    }),
  ),
  line_start: Type.Optional(
    Type.Number({ minimum: 1, description: "First line to read from a text resource (1-based)" }),
  ),
  line_end: Type.Optional(
    Type.Number({ minimum: 1, description: "Last line to read from a text resource (inclusive)" }),
  ),
});

type SkillParams = Static<typeof skillSchema>;

export function createSkillExtension(resource?: AgentResource): ExtensionDefinition {
  return {
    name: "skill",
    setup(ctx) {
      if (!resource) return;

      for (const command of resource.getSlashCommands?.() ?? []) {
        ctx.agent.registerSlash(command.name, {
          source: command.source,
          icon: command.source === "skill" ? "sparkles" : "file-text",
          description: command.description,
          arguments: { type: "text", required: false },
          template: (args) => resource.expandPrompt(`/${command.name}${args ? ` ${args}` : ""}`),
        });
      }

      if (!resource.hasSkills()) return;

      ctx.agent.registerTool({
        name: "skill",
        description:
          "Activate a skill from <available_skills>, or access one of its bundled resources. " +
          "Omit path to activate the entry instructions. Provide a relative directory path to list it, " +
          "or a relative file path to read it. Use this tool instead of read or ls for all files inside a skill.",
        parameters: skillSchema,
        async execute(params: SkillParams) {
          const result = resource.executeSkillTool(params);
          return {
            content: [{ type: "text", text: result.text }],
            details: result.details,
          };
        },
      });
    },
  };
}
