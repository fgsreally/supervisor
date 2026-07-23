/** Tool names from pi coding-agent / supervisor default-tools (read, bash, edit, write). */

import {
  askResultSummary,
  isAskToolName,
  parseAskQuestions,
  parseAskResultFromToolResult,
} from "./ask-tool";

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
      if (skillName) return `加载技能 ${skillName}`;
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
    case "skill": {
      const skillName = String(args.name ?? "skill");
      const path = typeof args.path === "string" ? args.path.trim() : "";
      return path ? `访问技能资源 ${skillName}/${path}` : `激活技能 ${skillName}`;
    }
    case "TimerCreate":
      return `安排定时任务：${String(args.prompt ?? "").slice(0, 36)}`;
    case "TimerList":
      return "查看当前定时安排";
    case "TimerDelete":
      return "取消定时任务";
    default: {
      if (isAskToolName(name)) {
        const questions = parseAskQuestions(args);
        const prompt = questions[0]?.prompt?.trim();
        if (!prompt) return "向你提问";
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
    return `完成 · ${lineCount} 行输出`;
  }
  switch (name) {
    case "read": {
      const lines = text ? text.split("\n").length : 0;
      return lines > 0 ? `已读取 · ${lines} 行` : "已读取";
    }
    case "write":
      return "已写入文件";
    case "edit": {
      if (text.startsWith("Error")) return text.split("\n")[0];
      const plus = (text.match(/^\+/gm) ?? []).length;
      const minus = (text.match(/^-/gm) ?? []).length;
      if (plus || minus) return `已修改 · +${plus} / -${minus}`;
      return "已应用修改";
    }
    case "bash": {
      const exitMatch = text.match(/exit code:\s*(\d+)/i);
      const exit = exitMatch ? exitMatch[1] : "0";
      const lineCount = text.split("\n").filter((l) => l.trim()).length;
      return exit === "0" ? `完成 · ${lineCount} 行输出` : `退出码 ${exit}`;
    }
    case "spawn_agent":
      return "子代理已启动";
    case "skill":
      return "技能资源已加载";
    case "TimerCreate":
      return "已安排";
    case "TimerList": {
      try {
        const parsed = JSON.parse(text) as unknown[];
        return `${parsed.length} 项`;
      } catch {
        return "已查看";
      }
    }
    case "TimerDelete":
      return "已取消";
    default: {
      if (isAskToolName(name)) {
        const details = parseAskResultFromToolResult({ content: content ?? [] });
        if (details?.cancelled) return "已取消";
        return askResultSummary(details) || "已回答";
      }
      return "完成";
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
      return "读取详情";
    case "write":
      return "写入内容";
    case "edit":
      return "diff / 详情";
    case "bash":
      return "终端输出";
    case "spawn_agent":
      return "子代理信息";
    case "skill":
      return "技能内容";
    default:
      return "详情";
  }
}
