import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderPromptTemplate } from "./system-prompts.js";

const CANDIDATES = ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];

export interface ContpluginFile {
  path: string;
  content: string;
}

function loadContpluginFileFromDir(dir: string): ContpluginFile | null {
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

export function loadWecodeContpluginFiles(cwd: string): ContpluginFile[] {
  const out: ContpluginFile[] = [];
  const seen = new Set<string>();

  let current = resolve(cwd);
  const root = resolve("/");
  while (true) {
    const context = loadContpluginFileFromDir(current);
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

export function appendContpluginFilesToSystemPrompt(baseSystemPrompt: string, cwd: string): string {
  const contexts = loadWecodeContpluginFiles(cwd);
  if (contexts.length === 0) return baseSystemPrompt;
  const sections = contexts.map((ctx) =>
    renderPromptTemplate("context-file-section", {
      path: ctx.path,
      content: ctx.content.trim(),
    }),
  );
  return [baseSystemPrompt.trim(), ...sections].filter(Boolean).join("\n\n");
}
