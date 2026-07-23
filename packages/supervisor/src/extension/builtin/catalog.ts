/** Catalog of Supervisor-shipped extensions (hardcoded modules). */

export type BuiltinExtensionSpec = {
  slug: string;
  name: string;
  description: string;
  /** Only load for main (non-subagent / non-btw) sessions. */
  requiresMainSession?: boolean;
};

export const BUILTIN_EXTENSIONS: readonly BuiltinExtensionSpec[] = [
  {
    slug: "eval",
    name: "Eval",
    description: "Expression evaluation helpers",
  },
  {
    slug: "task-management",
    name: "Task management",
    description: "Goals, plans, and task tracking tools",
  },
  {
    slug: "tool-loop-guard",
    name: "Tool loop guard",
    description: "Detects and interrupts repetitive tool loops",
  },
  {
    slug: "timer",
    name: "Timer",
    description: "Session timer / scheduling helpers",
  },
  {
    slug: "persistent-bash",
    name: "Persistent bash",
    description: "Long-lived shell sessions as jobs",
  },
  {
    slug: "skill",
    name: "Skills",
    description: "Loads and exposes bound skills",
  },
  {
    slug: "mcp",
    name: "MCP",
    description: "Model Context Protocol servers and tools",
  },
  {
    slug: "message-assets",
    name: "Message assets",
    description: "Attaches session media assets to messages",
  },
  {
    slug: "subagent",
    name: "Subagent",
    description: "Spawn and manage child agent sessions",
    requiresMainSession: true,
  },
] as const;

export const BUILTIN_EXTENSION_SLUGS = new Set(BUILTIN_EXTENSIONS.map((item) => item.slug));

export function isBuiltinExtensionResource(meta: Record<string, unknown> | undefined): boolean {
  return meta?.builtin === true;
}

export function builtinExtensionSourcePath(slug: string): string {
  return `builtin:${slug}`;
}
