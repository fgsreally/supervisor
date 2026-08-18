import btwSession from "../../../resource/prompts/btw-session.md";
import builtinAssistantSkill from "../../../resource/prompts/builtin-assistant-skill.md";
import contextFileSection from "../../../resource/prompts/context-file-section.md";
import projectParse from "../../../resource/prompts/project-parse.md";
import skillsPreamble from "../../../resource/prompts/skills-preamble.md";

const templateCache = new Map<string, string>();

const PROMPT_TEMPLATES: Record<string, string> = {
  "btw-session": btwSession,
  "builtin-assistant-skill": builtinAssistantSkill,
  "context-file-section": contextFileSection,
  "project-parse": projectParse,
  "skills-preamble": skillsPreamble,
};

export function loadPromptTemplate(name: string): string {
  const cached = templateCache.get(name);
  if (cached !== undefined) return cached;

  const content = PROMPT_TEMPLATES[name]?.trim();
  if (content === undefined) throw new Error(`Missing prompt template: ${name}.md`);
  templateCache.set(name, content);
  return content;
}

export function renderPromptTemplate(name: string, vars: Record<string, string>): string {
  let text = loadPromptTemplate(name);
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, value);
  }
  return text;
}
