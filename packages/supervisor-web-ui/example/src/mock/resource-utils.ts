import type { MockFileItem, MockResourceItem, MockSkillFile, MockSkillItem } from "./resources";

export function isSkillItem(item: MockResourceItem): item is MockSkillItem {
  return item.kind === "skills";
}

export function isFileItem(item: MockResourceItem): item is MockFileItem {
  return item.kind === "extensions" || item.kind === "prompts";
}

/** Sidebar label: skill folder name, or file base name (no extension) for ext/prompt. */
export function getFileBaseName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const lastDot = base.lastIndexOf(".");
  if (lastDot <= 0) return base;
  return base.slice(0, lastDot);
}

export function getResourceEntryLabel(item: MockResourceItem): string {
  if (isSkillItem(item)) return item.name;
  return getFileBaseName(item.fileName);
}

export function getResourcePreviewContent(item: MockResourceItem): string {
  if (isSkillItem(item)) {
    const manifest = item.files.find((f) => f.fileName === "SKILL.md") ?? item.files[0];
    return manifest?.content ?? "";
  }
  return item.content;
}

export function getSkillFileLanguage(fileName: string): "markdown" | "typescript" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".js")) return "typescript";
  return "markdown";
}

export function findSkillFile(skill: MockSkillItem, fileId: string): MockSkillFile | undefined {
  return skill.files.find((f) => f.id === fileId);
}
