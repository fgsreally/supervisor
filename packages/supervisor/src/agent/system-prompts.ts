import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const templateCache = new Map<string, string>();

/** Resolve the directory containing prompts shipped with Supervisor. */
export function getPackagedPromptsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "../../prompts"), join(here, "../prompts")];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(`Packaged prompts directory not found: ${candidates.join(", ")}`);
}

export function loadPromptTemplate(name: string): string {
  const cached = templateCache.get(name);
  if (cached !== undefined) return cached;

  const filePath = join(getPackagedPromptsDir(), `${name}.md`);
  if (!existsSync(filePath)) {
    throw new Error(`Missing prompt template: ${name}.md (${filePath})`);
  }

  const content = readFileSync(filePath, "utf-8").trim();
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

export function appendPromptSection(
  baseSystemPrompt: string,
  templateName: string,
  dedupeMarker: string,
): string {
  const section = loadPromptTemplate(templateName);
  if (baseSystemPrompt.includes(dedupeMarker)) return baseSystemPrompt;
  if (!baseSystemPrompt.trim()) return section;
  return `${baseSystemPrompt}\n\n${section}`;
}

export function appendReadOrchestrationHint(systemPrompt: string): string {
  return appendPromptSection(systemPrompt, "reading-strategy", "Reading strategy (two-phase)");
}
