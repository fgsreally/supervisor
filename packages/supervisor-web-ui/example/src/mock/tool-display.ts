/** Tool names from pi coding-agent / supervisor default-tools (read, bash, edit, write). */

export type CodingToolName = "read" | "write" | "edit" | "bash" | "spawn_agent" | string;

export function isCodingTool(name: string): name is "read" | "write" | "edit" | "bash" {
  return name === "read" || name === "write" || name === "edit" || name === "bash";
}

export function toolCallSummary(name: string, args: Record<string, unknown> | undefined): string {
  if (!args) return name;
  switch (name) {
    case "read":
      return `read ${args.path ?? ""}`;
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
    default:
      return name;
  }
}

export function toolResultSummary(
  name: string,
  content: Array<{ type: string; text: string }> | undefined,
): string {
  const text = content?.find((c) => c.type === "text")?.text ?? "";
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
    default:
      return "完成";
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
    default:
      return "详情";
  }
}
