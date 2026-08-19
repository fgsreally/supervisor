import { appendContextFilesToSystemPrompt } from "../resource/context-files.js";
import { parseSessionMeta } from "./session-fields.js";
import { buildSessionServicesPrompt, parseSessionServicesMeta } from "./session-services.js";
import type { SessionServicesMeta } from "../project/project-runtime.js";

const SNAPSHOT_MARKERS = [
  "# Context File:",
  "<!-- ext-sys:",
  "本 Session 已启动的本地服务",
  "本 Session 尚未启动本地服务",
  "Local services started for this Session",
  "No local services started for this Session",
];

const SESSION_FILES_INSTRUCTIONS = `
Session-owned files:
- Use @/path only with Supervisor file tools such as read, ls, grep, and find. @/ is a logical path rooted at this Session's private directory.
- Shell commands and eval code must use the SV_SESSION_DIR environment variable instead of @/ paths.
- Keep generated or transient files that are not source code (scripts, plans, todo files, intermediate data, and outputs) under SV_SESSION_DIR. Prefer scripts/, plans/, todos/, outputs/, and tmp/ subdirectories.
`;

const EXTERNAL_SESSION_FILES_INSTRUCTIONS = `
Session-owned files:
- This external Agent does not have Supervisor's logical file-tool path syntax. Session-owned paths use \${SV_SESSION_DIR}/path.
- Use the SV_SESSION_DIR environment variable in shell commands and scripts for Session-owned files.
- Keep generated or transient files that are not source code (scripts, plans, todo files, intermediate data, and outputs) under SV_SESSION_DIR. Prefer scripts/, plans/, todos/, outputs/, and tmp/ subdirectories.
`;

/** True when `sessions.system_prompt` looks like a frozen compose snapshot, not spawn extra. */
export function isStoredSystemPromptSnapshot(stored: string | null | undefined): boolean {
  const text = stored?.trim() ?? "";
  if (!text) return false;
  return SNAPSHOT_MARKERS.some((marker) => text.includes(marker));
}

/** Spawn extra only; ignore legacy full-prompt snapshots so they are not re-injected. */
export function sessionSystemPromptExtra(stored: string | null | undefined): string {
  if (isStoredSystemPromptSnapshot(stored)) return "";
  return stored?.trim() ?? "";
}

export function composeSessionSystemPrompt(options: {
  extra?: string | null;
  agentSystemMd: string;
  cwd: string;
  services?: SessionServicesMeta | null;
  overlay?: string | null;
  external?: boolean;
}): string {
  const extra = sessionSystemPromptExtra(options.extra);
  const parts = [options.agentSystemMd, extra, options.overlay ?? ""].filter(
    (part) => part.trim().length > 0,
  );
  const withContext = appendContextFilesToSystemPrompt(parts.join("\n\n"), options.cwd);
  const services = options.services ? buildSessionServicesPrompt(options.services) : "";
  const fileInstructions = options.external
    ? EXTERNAL_SESSION_FILES_INSTRUCTIONS
    : SESSION_FILES_INSTRUCTIONS;
  const prompt = [withContext, services, fileInstructions]
    .filter((part) => part.trim().length > 0)
    .join("\n\n");
  return options.external ? prompt.replaceAll("@/", "${SV_SESSION_DIR}/") : prompt;
}

/** Compose from current agent prompt, cwd AGENTS.md, and meta.services. */
export function composeLiveSessionSystemPrompt(input: {
  cwd: string;
  agentSystemMd?: string | null;
  storedSystemPrompt?: string | null;
  meta?: string | Record<string, unknown> | null;
  overlay?: string | null;
  external?: boolean;
}): string {
  return composeSessionSystemPrompt({
    extra: input.storedSystemPrompt,
    agentSystemMd: input.agentSystemMd ?? "",
    cwd: input.cwd,
    services: parseSessionServicesMeta(parseSessionMeta(input.meta ?? {})),
    overlay: input.overlay,
    external: input.external,
  });
}

export type SystemPromptOverlay = {
  fragments: string[];
  blocks: Map<string, string>;
};

export function formatSystemPromptOverlay(overlay: SystemPromptOverlay | undefined): string {
  if (!overlay) return "";
  const parts = [...overlay.fragments];
  for (const [id, content] of overlay.blocks) {
    const fragment = content.trim();
    if (!fragment) continue;
    parts.push(`<!-- ext-sys:${id} -->\n${fragment}\n<!-- /ext-sys:${id} -->`);
  }
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}
