import type { Project } from "../../types.js";

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
    "You are a temporary project analysis assistant. Explore the current working directory in read-only mode and produce a project description that helps assign future tasks.",
    "",
    "Requirements:",
    "1. Use read-only tools (list directories and inspect key files such as README, package.json, pyproject.toml, Cargo.toml, and go.mod). Do not modify files.",
    "2. Write the description in Chinese, with clear structure, in 200-600 Chinese characters.",
    "3. Cover the project purpose, technology stack, major directories/modules, build or run commands when identifiable, and constraints relevant to future task assignment.",
    "4. Return only the project description body. Do not add a greeting or wrap the full response in a code block.",
    "",
    `Project name: ${project.name}`,
    `Path: ${project.cwd}`,
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
