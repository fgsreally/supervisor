import type { Project } from "../types.js";

/** Meta keys written by project-description generation. */
export const PROJECT_DESCRIPTION_META = {
  description: "description",
  status: "descriptionStatus",
  error: "descriptionError",
  sessionId: "descriptionSessionId",
  updatedAt: "descriptionUpdatedAt",
} as const;

export type ProjectDescriptionStatus = "pending" | "ready" | "error" | "skipped";

export function buildProjectDescriptionInstructions(
  project: Pick<Project, "name" | "cwd">,
): string {
  return [
    "你是临时项目分析助手。请只读探索当前工作目录，整理一份便于后续智能分配任务的项目描述。",
    "",
    "要求：",
    "1. 使用只读工具（列目录、读 README/package.json/pyproject.toml/Cargo.toml/go.mod 等关键文件）。不要修改任何文件。",
    "2. 描述用中文，结构清晰，控制在 200-600 字。",
    "3. 覆盖：项目用途、技术栈、主要目录/模块、构建或运行方式（若能判断）、适合分配任务时需注意的约束。",
    "4. 最终回复只输出项目描述正文，不要寒暄，不要用代码块包裹全文。",
    "",
    `项目名：${project.name}`,
    `路径：${project.cwd}`,
  ].join("\n");
}

export function normalizeProjectDescription(text: string): string {
  let value = text.trim();
  if (!value) return "";
  const fenced = value.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  if (fenced?.[1]) value = fenced[1].trim();
  return value.slice(0, 4000);
}

export function readAssistantTextFromPayload(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as {
      message?: { content?: unknown };
      content?: unknown;
    };
    const content = parsed.message?.content ?? parsed.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object" && "text" in part) {
            const text = (part as { text?: unknown }).text;
            return typeof text === "string" ? text : "";
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
  } catch {
    return payload;
  }
  return "";
}
