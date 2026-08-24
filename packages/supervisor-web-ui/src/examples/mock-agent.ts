import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { ChatEntry } from "@/types/chat-entry";
import { getExampleBranch } from "./index";

export type DemoEvent =
  | AgentEvent
  | {
      type: "shadow_running";
      running: boolean;
      timestamp: number;
    }
  | {
      type: "shadow_message";
      entryId: string;
      message: string;
      level: "error" | "warning" | "info";
      timestamp: number;
      complete?: boolean;
    }
  | {
      type: "shadow_suggestions";
      questions: string[];
      timestamp: number;
    }
  | {
      type: "example_entry";
      entry: ChatEntry;
    }
  | {
      type: "example_stage";
      stage: string;
    };

export function streamExampleReply(
  sessionId: string,
  branchId: string,
  roundIndex: number,
  emit: (event: DemoEvent) => void,
  done: () => void,
): () => void {
  const branch =
    getExampleBranch(sessionId, branchId, roundIndex) ??
    getExampleBranch(sessionId, "1", roundIndex);
  if (!branch) {
    done();
    return () => undefined;
  }
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (callback: () => void, delay: number) => {
    timers.push(
      setTimeout(() => {
        if (!cancelled) callback();
      }, delay),
    );
  };
  const now = () => Date.now();
  const text = branch.assistant;
  const shadow = branch.shadow;
  const thinking = branch.thinking;
  const tools = branch.tools ?? [];
  const chunks = text.match(/.{1,12}/gu) ?? [text];
  let elapsed = 0;

  if (branch.stage) emit({ type: "example_stage", stage: branch.stage });

  if (thinking) {
    for (const chunk of thinking.match(/.{1,12}/gu) ?? [thinking]) {
      elapsed += 150;
      later(
        () =>
          emit({
            type: "message_update",
            assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: chunk },
          } as AgentEvent),
        elapsed,
      );
    }
  }

  for (const [index, tool] of tools.entries()) {
    const toolCallId = `${sessionId}:tool:${now()}:${index}`;
    elapsed += 180;
    later(
      () =>
        emit({
          type: "tool_execution_start",
          toolCallId,
          toolName: tool.name,
          args: tool.arguments ?? {},
        } as AgentEvent),
      elapsed,
    );
    elapsed += 420;
    later(
      () =>
        emit({
          type: "tool_execution_end",
          toolCallId,
          toolName: tool.name,
          result: { content: [{ type: "text", text: tool.result }] },
          isError: tool.isError ?? false,
        } as AgentEvent),
      elapsed,
    );
  }

  if (shadow) {
    emit({ type: "shadow_running", running: true, timestamp: now() });
  }
  for (const chunk of chunks) {
    elapsed += 180;
    later(
      () =>
        emit({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: chunk },
        } as AgentEvent),
      elapsed,
    );
  }
  if (shadow) {
    const shadowEntryId = `${sessionId}:shadow:${now()}`;
    const shadowChunks = shadow.message.match(/.{1,8}/gu) ?? [shadow.message];
    let shadowText = "";
    for (const [index, chunk] of shadowChunks.entries()) {
      elapsed += 190;
      shadowText += chunk;
      const message = shadowText;
      const complete = index === shadowChunks.length - 1;
      later(() => {
        emit({
          type: "shadow_message",
          entryId: shadowEntryId,
          message,
          level: shadow.level,
          timestamp: now(),
          complete,
        });
        if (complete) emit({ type: "shadow_running", running: false, timestamp: now() });
      }, elapsed);
    }
  }
  if (branch.suggestions) {
    later(
      () =>
        emit({ type: "shadow_suggestions", questions: branch.suggestions ?? [], timestamp: now() }),
      elapsed + 180,
    );
  }
  if (branch.entries?.length) {
    later(() => {
      for (const entry of branch.entries ?? []) emit({ type: "example_entry", entry });
    }, elapsed + 180);
  }
  later(done, elapsed + 240);

  return () => {
    cancelled = true;
    for (const timer of timers) clearTimeout(timer);
  };
}
