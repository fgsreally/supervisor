import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export type TaskArtifactType = "goal" | "plan";
export interface TaskArtifact {
  path: string;
  type: TaskArtifactType;
  title: string;
  status: string;
  content: string;
}

export function taskArtifactPath(type: TaskArtifactType): string {
  return `tasks/${type}-${Date.now()}.md`;
}

export async function writeTaskArtifact(
  sessionDir: string,
  path: string,
  input: { type: TaskArtifactType; title: string; status: string; body: string },
): Promise<void> {
  const target = join(sessionDir, path);
  await mkdir(join(sessionDir, "tasks"), { recursive: true });
  const text = `---\ntype: ${input.type}\ntitle: ${input.title.replaceAll("\n", " ")}\nstatus: ${input.status}\nupdatedAt: ${new Date().toISOString()}\n---\n\n${input.body.trim()}\n`;
  await writeFile(target, text, "utf-8");
}

export async function readTaskArtifact(
  sessionDir: string,
  path: string,
): Promise<TaskArtifact | null> {
  if (!/^tasks\/[A-Za-z0-9._-]+\.md$/.test(path)) return null;
  const content = await readFile(join(sessionDir, path), "utf-8").catch(() => null);
  if (content === null) return null;
  const field = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, "m").exec(content)?.[1]?.trim();
  const type = field("type");
  if (type !== "goal" && type !== "plan") return null;
  return {
    path,
    type,
    title: field("title") ?? basename(path, ".md"),
    status: field("status") ?? "active",
    content,
  };
}

export function activeTaskPaths(meta: Record<string, unknown>): string[] {
  return Array.isArray(meta.tasks)
    ? meta.tasks.filter((path): path is string => typeof path === "string")
    : [];
}
