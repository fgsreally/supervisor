import { appendContextFilesToSystemPrompt } from "../../../agent/context-files.js";
import type { ShadowProtocolResult } from "./types.js";
import { Type } from "typebox";

export const ShadowResultSchema = Type.Object({
  shadowMemory: Type.Optional(
    Type.Object({
      action: Type.Union([Type.Literal("append"), Type.Literal("replace")]),
      content: Type.String(),
    }),
  ),
  message: Type.Optional(Type.String()),
  interrupt: Type.Optional(Type.Boolean()),
  status: Type.Optional(Type.String()),
  suggestedQuestions: Type.Optional(Type.Array(Type.String())),
  title: Type.Optional(Type.String()),
  commitMessage: Type.Optional(Type.String()),
});

/**
 * Shadow 华生任务硬编码系统提示（不读 Agent SYSTEM.md，不走 XML）。
 * 结构化结果一律通过终止型工具 submit_result 提交。
 */
export const SHADOW_SYSTEM_PROMPT = `你是主会话的影子观察者（Shadow）。你不出现在会话树中，也不直接面对用户。

你在主代理完成一轮工作后安静观察「最新一轮对话」。默认应几乎无感：绝大多数回合只需提交空结果。

职责（仅在确有必要时才填写对应字段）：
- 维护简洁、可靠的长期影子记忆（shadowMemory）
- 仅在确有必要时向主代理发送一条提醒（message）
- 仅在存在清晰且有价值的下一步时，给出用户可发送的建议问题（suggestedQuestions，最多 4 条）
- 仅在当前标题明显错误/无意义，且本轮已形成稳定主题时给出新标题（title）
- 仅在累积改动形成可测试的连贯里程碑时给出中间提交说明（commitMessage）；这只创建 Session 分支检查点，不代表 Session 应完成或合并
- status：一句短句描述主代理当前在做什么及进展（进展有实质变化时可刷新）

不要总结普通对话，不要记录临时细节，不要重复主代理已经知道的内容，不要为了润色而改标题。
一次常规问答、确认、进度汇报或顺利完成的工作，通常应提交空对象。

完成后必须作为最后一步调用工具 submit_result（参数 result 为 JSON 对象）；不要只写在回复正文里，不要输出 XML。
无事可报时仍须调用：submit_result({ "result": {} })。`;

export function getShadowSystemPrompt(cwd?: string): string {
  return cwd ? appendContextFilesToSystemPrompt(SHADOW_SYSTEM_PROMPT, cwd) : SHADOW_SYSTEM_PROMPT;
}

export function formatShadowRunPrompt(shadowMemory: string, latestTurn: string): string {
  return [
    "请观察以下上下文，然后调用 submit_result 提交结果。",
    "",
    "结果对象字段（全部可选；无事可报用 {}）：",
    "{",
    '  "shadowMemory": { "action": "append" | "replace", "content": "..." },',
    '  "message": "发给主代理的提醒",',
    '  "interrupt": true,',
    '  "status": "一句短句：主代理当前工作与进展",',
    '  "suggestedQuestions": ["用户可能接着问的短问题", "..."],',
    '  "title": "例外：替换明显错误的会话标题",',
    '  "commitMessage": "例外：中间检查点的 conventional commit 说明"',
    "}",
    "",
    "约束：",
    "- interrupt 仅在必须立刻打断主代理当前执行的异常问题时为 true；否则省略。",
    "- suggestedQuestions 最多 4 条、互不重复的短问题。",
    "- shadowMemory.action 仅限 append | replace。",
    "",
    "## Shadow memory",
    shadowMemory.trim() || "(empty)",
    "",
    "## Latest turn",
    latestTurn.trim() || "(empty)",
  ].join("\n");
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asStringArray(value: unknown, limit: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => asNonEmptyString(item)?.replace(/\s+/g, " "))
    .filter((item): item is string => Boolean(item))
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, limit);
  return items.length > 0 ? items : undefined;
}

/** Normalize Watson submit_result payload into Shadow fields. */
export function normalizeShadowSubmitResult(rawInput: unknown): ShadowProtocolResult | null {
  let raw = rawInput;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      raw = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  const memoryRaw = record.shadowMemory;
  let shadowMemory: ShadowProtocolResult["shadowMemory"];
  if (memoryRaw && typeof memoryRaw === "object" && !Array.isArray(memoryRaw)) {
    const memory = memoryRaw as Record<string, unknown>;
    const action = memory.action === "append" || memory.action === "replace" ? memory.action : null;
    const content = asNonEmptyString(memory.content);
    if (action && content) shadowMemory = { action, content };
  }

  return {
    shadowMemory,
    message: asNonEmptyString(record.message),
    interrupt: record.interrupt === true,
    suggestedQuestions: asStringArray(record.suggestedQuestions, 4),
    status: asNonEmptyString(record.status),
    title: asNonEmptyString(record.title),
    commitMessage: asNonEmptyString(record.commitMessage),
  };
}
