import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { renderPromptTemplate } from "./system-prompts.js";

const CANDIDATES = ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];

export interface ContextFile {
  path: string;
  content: string;
}

function loadContextFileFromDir(dir: string): ContextFile | null {
  for (const filename of CANDIDATES) {
    const filePath = join(dir, filename);
    if (!existsSync(filePath)) continue;
    try {
      return { path: filePath, content: readFileSync(filePath, "utf8") };
    } catch {
      // ignore unreadable context file
    }
  }
  return null;
}

export function loadSupervisorContextFiles(cwd: string): ContextFile[] {
  const out: ContextFile[] = [];
  const seen = new Set<string>();

  const globalAgentDir = join(homedir(), ".pi", "agent");
  const globalContext = loadContextFileFromDir(globalAgentDir);
  if (globalContext) {
    out.push(globalContext);
    seen.add(globalContext.path);
  }

  let current = resolve(cwd);
  const root = resolve("/");
  while (true) {
    const context = loadContextFileFromDir(current);
    if (context && !seen.has(context.path)) {
      out.unshift(context);
      seen.add(context.path);
    }
    if (current === root) break;
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }

  return out;
}

export function appendContextFilesToSystemPrompt(baseSystemPrompt: string, cwd: string): string {
  const contexts = loadSupervisorContextFiles(cwd);
  if (contexts.length === 0) return baseSystemPrompt;
  const sections = contexts.map((ctx) =>
    renderPromptTemplate("context-file-section", {
      path: ctx.path,
      content: ctx.content.trim(),
    }),
  );
  return `${baseSystemPrompt}${sections.join("\n")}`;
}
