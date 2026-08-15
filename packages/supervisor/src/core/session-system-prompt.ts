import { appendContextFilesToSystemPrompt } from "./resource/context-files.js";
import { parseSessionMeta } from "./session-fields.js";
import { buildSessionServicesPrompt, parseSessionServicesMeta } from "./session-services.js";
import type { SessionServicesMeta } from "./project-runtime.js";

const SNAPSHOT_MARKERS = [
  "# Context File:",
  "<!-- ext-sys:",
  "本 Session 已启动的本地服务",
  "本 Session 尚未启动本地服务",
];

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
}): string {
  const extra = sessionSystemPromptExtra(options.extra);
  const parts = [options.agentSystemMd, extra, options.overlay ?? ""].filter(
    (part) => part.trim().length > 0,
  );
  const withContext = appendContextFilesToSystemPrompt(parts.join("\n\n"), options.cwd);
  const services = options.services ? buildSessionServicesPrompt(options.services) : "";
  return [withContext, services].filter((part) => part.trim().length > 0).join("\n\n");
}

/** Compose from current agent prompt, cwd AGENTS.md, and meta.services. */
export function composeLiveSessionSystemPrompt(input: {
  cwd: string;
  agentSystemMd?: string | null;
  storedSystemPrompt?: string | null;
  meta?: string | Record<string, unknown> | null;
  overlay?: string | null;
}): string {
  return composeSessionSystemPrompt({
    extra: input.storedSystemPrompt,
    agentSystemMd: input.agentSystemMd ?? "",
    cwd: input.cwd,
    services: parseSessionServicesMeta(parseSessionMeta(input.meta ?? {})),
    overlay: input.overlay,
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
