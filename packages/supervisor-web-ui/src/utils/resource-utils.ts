import type { UIFileItem, UIResourceItem, UISkillFile, UISkillItem } from "@/types/ui";

export function isSkillItem(item: UIResourceItem): item is UISkillItem {
  return item.kind === "skills";
}

export function isFileItem(item: UIResourceItem): item is UIFileItem {
  return item.kind === "extensions" || item.kind === "prompts" || item.kind === "mcp";
}

export function getFileBaseName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const lastDot = base.lastIndexOf(".");
  if (lastDot <= 0) return base;
  return base.slice(0, lastDot);
}

export function getResourceEntryLabel(item: UIResourceItem): string {
  if (isSkillItem(item)) return item.name;
  return getFileBaseName(item.fileName);
}

export function getResourcePreviewContent(item: UIResourceItem): string {
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

export function resourceEntryPath(item: UIResourceItem): string {
  if (isSkillItem(item)) return item.rootPath ?? "";
  return item.path;
}

export function relativeSupervisorPath(path: string): string {
  const normalized = path.trim().replaceAll("\\", "/");
  const withoutHome = normalized.replace(/^~\/\.pi\/supervisor\//i, "");
  if (withoutHome !== normalized) return withoutHome.replace(/^global\//i, "");

  const marker = "/.pi/supervisor/";
  const markerIndex = normalized.toLowerCase().lastIndexOf(marker);
  if (markerIndex >= 0) {
    return normalized.slice(markerIndex + marker.length).replace(/^global\//i, "");
  }

  const globalMarker = "/global/";
  const globalIndex = normalized.toLowerCase().lastIndexOf(globalMarker);
  if (globalIndex >= 0) return normalized.slice(globalIndex + globalMarker.length);
  return normalized;
}

export function findSkillFile(skill: UISkillItem, fileId: string): UISkillFile | undefined {
  return skill.files.find((f) => f.id === fileId);
}
