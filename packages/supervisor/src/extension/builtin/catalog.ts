/** Catalog of Supervisor-shipped extensions (hardcoded modules). */

export type BuiltinExtensionSpec = {
  slug: string;
  name: string;
  description: string;
  /** Only load for main (non-subagent / non-btw) sessions. */
  requiresMainSession?: boolean;
  /** Restrict binding/loading to shipped assistant names. */
  agentNames?: readonly string[];
  /** Also bind by default on packaged external agents (Codex / Claude / ACP). */
  bindExternalByDefault?: boolean;
};

export const BUILTIN_EXTENSIONS: readonly BuiltinExtensionSpec[] = [
  {
    slug: "supervisor-admin",
    name: "Supervisor admin",
    description: "HTTP, SQLite, and extension scaffolding tools for the built-in Pi assistant",
    agentNames: ["Pi 助手"],
  },
  {
    slug: "eval",
    name: "Eval",
    description: "Expression evaluation helpers",
  },
  {
    slug: "task-management",
    name: "Todo",
    description: "Todo tracking, Plan mode, and Goal execution",
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
    slug: "service",
    name: "Service",
    description: "Add, delete, or update per-session local services",
    requiresMainSession: true,
    bindExternalByDefault: true,
  },
  {
    slug: "git",
    name: "Git",
    description:
      "Per-session git worktree; Watson cleans up locked worktrees on delete via AGENTS.md",
    bindExternalByDefault: true,
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
