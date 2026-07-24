/** Slash command source kinds — keep in sync with message bubble tags. */

export type SlashCommandSource = "skill" | "prompt" | "custom" | "mcp";

export interface SlashCommandCatalog {
  skills: Array<{ name: string }>;
  prompts: Array<{ name: string }>;
  commands: Array<{ name: string; source?: "skill" | "prompt" | "custom" | "mcp" }>;
}

export function normalizeSlashCommandName(token: string): string {
  const raw = token.trim();
  const skill = raw.match(/^\/skill:([\w-]+)$/);
  if (skill?.[1]) return skill[1];
  return raw.replace(/^\//, "");
}

export function resolveSlashCommandSource(
  token: string,
  catalog: SlashCommandCatalog,
): SlashCommandSource {
  if (/^\/skill:/i.test(token.trim())) return "skill";

  const name = normalizeSlashCommandName(token).toLowerCase();
  if (!name) return "custom";

  if (catalog.skills.some((s) => s.name.toLowerCase() === name)) return "skill";
  if (catalog.prompts.some((p) => p.name.toLowerCase() === name)) return "prompt";

  const command = catalog.commands.find((c) => c.name.replace(/^\//, "").toLowerCase() === name);
  if (command?.source === "skill" || command?.source === "prompt" || command?.source === "mcp") {
    return command.source;
  }
  if (command) return command.source === "custom" ? "custom" : "custom";

  return "custom";
}

/** Lucide-like 14px stroke icons for slash tags (DOM, not Vue). */
export function slashSourceIconSvg(source: SlashCommandSource): string {
  const common =
    'viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  switch (source) {
    case "skill":
      // sparkles
      return `<svg ${common}><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m5.6 5.6 2.1 2.1"/><path d="m16.3 16.3 2.1 2.1"/><path d="m5.6 18.4 2.1-2.1"/><path d="m16.3 7.7 2.1-2.1"/><circle cx="12" cy="12" r="3"/></svg>`;
    case "prompt":
      // file-text
      return `<svg ${common}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`;
    case "mcp":
      // plug
      return `<svg ${common}><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8Z"/></svg>`;
    case "custom":
    default:
      // terminal
      return `<svg ${common}><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>`;
  }
}
