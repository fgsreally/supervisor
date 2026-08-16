/** Tool names from pi coding-agent / supervisor default-tools (read, bash, edit, write). */

import {
  askResultSummary,
  isAskToolName,
  parseAskQuestions,
  parseAskResultFromToolResult,
} from "./ask-tool";
import { translate as t } from "@/i18n";

export type CodingToolName = "read" | "write" | "edit" | "bash" | "spawn_agent" | string;

export function isCodingTool(name: string): name is "read" | "write" | "edit" | "bash" {
  return name === "read" || name === "write" || name === "edit" || name === "bash";
}

function skillNameFromReadPath(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  if (!normalized.includes("/skills/") || !normalized.endsWith("/SKILL.md")) return undefined;
  const parts = normalized.split("/");
  return parts[parts.length - 2];
}

export function isSkillReadPath(path: string): boolean {
  return skillNameFromReadPath(path) !== undefined;
}

export function toolCallSummary(name: string, args: Record<string, unknown> | undefined): string {
  if (name.toLowerCase().includes("eval")) {
    const code = typeof args?.code === "string" ? args.code.trim().split("\n")[0] : "";
    return code ? `eval ${code.slice(0, 48)}` : "eval";
  }
  if (!args) return name;
  const intent = typeof args.intent === "string" ? args.intent.trim() : "";
  if (intent) return intent.length > 52 ? `${intent.slice(0, 49)}...` : intent;
  switch (name) {
    case "read": {
      const path = String(args.path ?? "");
      const skillName = skillNameFromReadPath(path);
      if (skillName) return t("tool.loadSkill", { name: skillName });
      return `read ${path}`;
    }
    case "write":
      return `write ${args.path ?? ""}`;
    case "edit":
      return `edit ${args.path ?? ""}`;
    case "bash": {
      const intent = typeof args.intent === "string" ? args.intent.trim() : "";
      if (intent) return intent.length > 60 ? `${intent.slice(0, 57)}...` : intent;
      const cmd = typeof args.command === "string" ? args.command : "";
      const oneLine = cmd.split("\n")[0];
      return oneLine.length > 60 ? `${oneLine.slice(0, 57)}...` : oneLine || "bash";
    }
    case "spawn_agent":
      return `spawn ${args.agentId ?? "subagent"}`;
    case "ProjectServiceSetup":
      return t("tool.registerApp");
    case "ProjectServiceStart":
      return t("tool.startApp");
    case "ProjectServiceStop":
      return t("tool.stopApp");
    case "ProjectServiceDestroy":
      return t("tool.destroyApp");
    case "skill": {
      const skillName = String(args.name ?? "skill");
      const path = typeof args.path === "string" ? args.path.trim() : "";
      return path
        ? t("tool.accessSkillResource", { name: skillName, path })
        : t("tool.activateSkill", { name: skillName });
    }
    case "TimerCreate":
      return t("tool.createTimer", { prompt: String(args.prompt ?? "").slice(0, 36) });
    case "TimerList":
      return t("tool.listTimers");
    case "TimerDelete":
      return t("tool.deleteTimer");
    default: {
      if (isAskToolName(name)) {
        const questions = parseAskQuestions(args);
        const prompt = questions[0]?.prompt?.trim();
        if (!prompt) return t("tool.askYou");
        return prompt.length > 40 ? `${prompt.slice(0, 37)}...` : prompt;
      }
      return name;
    }
  }
}

export function toolResultSummary(
  name: string,
  content: Array<{ type: string; text: string }> | undefined,
): string {
  const text = content?.find((c) => c.type === "text")?.text ?? "";
  if (name.toLowerCase().includes("eval")) {
    const lineCount = text.split("\n").filter((line) => line.trim()).length;
    return t("tool.completedOutput", { count: lineCount });
  }
  switch (name) {
    case "read": {
      const lines = text ? text.split("\n").length : 0;
      return lines > 0 ? t("tool.readOutput", { count: lines }) : t("tool.read");
    }
    case "write":
      return t("tool.written");
    case "edit": {
      if (text.startsWith("Error")) return text.split("\n")[0];
      const plus = (text.match(/^\+/gm) ?? []).length;
      const minus = (text.match(/^-/gm) ?? []).length;
      if (plus || minus) return t("tool.editedStats", { plus, minus });
      return t("tool.edited");
    }
    case "bash": {
      const exitMatch = text.match(/exit code:\s*(\d+)/i);
      const exit = exitMatch ? exitMatch[1] : "0";
      const lineCount = text.split("\n").filter((l) => l.trim()).length;
      return exit === "0"
        ? t("tool.completedOutput", { count: lineCount })
        : t("tool.exitCode", { code: exit });
    }
    case "spawn_agent":
      return t("tool.subagentStarted");
    case "skill":
      return t("tool.skillLoaded");
    case "TimerCreate":
      return t("tool.timerCreated");
    case "TimerList": {
      try {
        const parsed = JSON.parse(text) as unknown[];
        return t("tool.timerCount", { count: parsed.length });
      } catch {
        return t("tool.timerListed");
      }
    }
    case "TimerDelete":
      return t("tool.timerDeleted");
    default: {
      if (isAskToolName(name)) {
        const details = parseAskResultFromToolResult({ content: content ?? [] });
        if (details?.cancelled) return t("ask.cancelled");
        return askResultSummary(details) || t("ask.answered");
      }
      return t("tool.completed");
    }
  }
}

export function toolCallDetail(name: string, args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  switch (name) {
    case "read":
      return [
        `path: ${String(args.path ?? "")}`,
        args.offset != null ? `offset: ${args.offset}` : null,
        args.limit != null ? `limit: ${args.limit}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    case "write":
      return `path: ${String(args.path ?? "")}\n\n${String(args.content ?? "")}`;
    case "edit":
      return [
        `path: ${String(args.path ?? "")}`,
        "",
        "--- old_string ---",
        String(args.old_string ?? ""),
        "",
        "--- new_string ---",
        String(args.new_string ?? ""),
      ].join("\n");
    case "bash": {
      const intent = typeof args.intent === "string" ? args.intent.trim() : "";
      const cmd = typeof args.command === "string" ? args.command : "";
      const parts = [intent ? `intent: ${intent}` : null, cmd ? `command:\n${cmd}` : null].filter(
        Boolean,
      );
      return parts.join("\n\n") || JSON.stringify(args, null, 2);
    }
    case "spawn_agent":
      return JSON.stringify(args, null, 2);
    case "skill":
      return [
        `name: ${String(args.name ?? "")}`,
        args.path != null ? `path: ${String(args.path)}` : null,
        args.arguments != null ? `arguments: ${String(args.arguments)}` : null,
        args.line_start != null ? `line_start: ${args.line_start}` : null,
        args.line_end != null ? `line_end: ${args.line_end}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    default:
      return JSON.stringify(args, null, 2);
  }
}

export function toolResultDetail(
  content: Array<{ type: string; text: string }> | undefined,
): string {
  return content?.find((c) => c.type === "text")?.text ?? "";
}

export function toolDetailLabel(name: string): string {
  switch (name) {
    case "read":
      return t("tool.detail.read");
    case "write":
      return t("tool.detail.write");
    case "edit":
      return t("tool.detail.edit");
    case "bash":
      return t("tool.detail.bash");
    case "spawn_agent":
      return t("tool.detail.subagent");
    case "skill":
      return t("tool.detail.skill");
    default:
      return t("tool.detail.default");
  }
}
