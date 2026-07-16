import type { MockEntry, MockToolPart } from "../mock/types";

/** Session id for the SSE-style streaming mock demo. */
export const STREAM_DEMO_SESSION_ID = "session-stream";

export function isStreamDemoSession(sessionId: string): boolean {
  return sessionId === STREAM_DEMO_SESSION_ID;
}

export type MockStreamHandlers = {
  onTextDelta: (delta: string) => void;
  onToolCall: (part: MockToolPart) => void;
  onToolResult: (entry: Extract<MockEntry, { type: "toolResult" }>) => void;
};

type StreamStep =
  | { kind: "text"; text: string }
  | {
      kind: "tool";
      name: "bash" | "read" | "edit" | "write";
      arguments: Record<string, unknown>;
      resultText: string;
      pauseMs?: number;
    };

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function streamText(text: string, onDelta: (delta: string) => void, signal?: AbortSignal) {
  let offset = 0;
  while (offset < text.length) {
    await sleep(14 + Math.floor(Math.random() * 36), signal);
    const size = 1 + Math.floor(Math.random() * 3);
    const delta = text.slice(offset, offset + size);
    offset += delta.length;
    if (delta) onDelta(delta);
  }
}

function extractPathHint(userText: string): string {
  const match = userText.match(/(?:[\w.-]+\/)+[\w.-]+\.(?:vue|ts|tsx|js|md)/i);
  return match?.[0] ?? "packages/supervisor-web-ui/example/src/views/ChatView.vue";
}

function buildTurnSteps(userText: string, agentName: string): StreamStep[] {
  const path = extractPathHint(userText);
  const quoted = userText.length > 120 ? `${userText.slice(0, 120)}…` : userText;

  return [
    {
      kind: "text",
      text: `收到（${agentName}）：「${quoted}」。先列出 example 目录，再读取目标文件。`,
    },
    {
      kind: "tool",
      name: "bash",
      arguments: {
        intent: "列出 example 源码目录结构",
        command: "ls -la packages/supervisor-web-ui/example/src",
      },
      resultText: "components/\nmock/\nutils/\nviews/\nApp.vue\nmain.ts\nstyle.css\n",
      pauseMs: 420,
    },
    {
      kind: "text",
      text: `\n\n用 **read** 查看 \`${path}\`：`,
    },
    {
      kind: "tool",
      name: "read",
      arguments: { path, offset: 1, limit: 40 },
      resultText: [
        "<template>",
        '  <div class="flex flex-col h-full w-full bg-[#f5f5f5]" v-if="session">',
        "    <!-- header -->",
        "    ...",
      ].join("\n"),
      pauseMs: 520,
    },
    {
      kind: "text",
      text: "\n\n根据你的需求，用 **edit** 在文件头加入一行注释（mock 补丁）：",
    },
    {
      kind: "tool",
      name: "edit",
      arguments: {
        path,
        edits: [
          {
            oldText: "<template>",
            newText: "<!-- mock stream demo: user request recorded -->\n<template>",
          },
        ],
      },
      resultText: `--- a/${path}\n+++ b/${path}\n@@\n+<!-- mock stream demo: user request recorded -->\n <template>`,
      pauseMs: 480,
    },
    {
      kind: "text",
      text: "\n\n把本次请求摘要 **write** 到临时说明文件：",
    },
    {
      kind: "tool",
      name: "write",
      arguments: {
        path: "packages/supervisor-web-ui/example/.stream-demo-last-request.md",
        content: `# Last stream demo request\n\n${userText}\n`,
      },
      resultText:
        "Wrote packages/supervisor-web-ui/example/.stream-demo-last-request.md (48 bytes)",
      pauseMs: 380,
    },
    {
      kind: "text",
      text: "\n\n以上步骤按 SSE 节奏到达：`text` 增量 → `tool_call` → `tool_result` → `agent_end`。真实 supervisor 通过 `/sessions/:id/events` 推送同类事件。",
    },
  ];
}

let callSeq = 0;

/**
 * Replays a full agent turn with streaming text and sequential tool calls (bash / read / edit / write).
 */
export async function runStreamDemoTurn(
  userText: string,
  agentName: string,
  handlers: MockStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  callSeq = 0;
  const steps = buildTurnSteps(userText, agentName);

  for (const step of steps) {
    if (step.kind === "text") {
      await streamText(step.text, handlers.onTextDelta, signal);
      continue;
    }

    const callId = `stream-call-${++callSeq}`;
    const toolPart: MockToolPart = {
      type: "toolCall",
      id: callId,
      name: step.name,
      arguments: step.arguments,
    };
    handlers.onToolCall(toolPart);
    await sleep(step.pauseMs ?? 400, signal);
    handlers.onToolResult({
      id: `stream-result-${callSeq}`,
      type: "toolResult",
      toolCallId: callId,
      toolName: step.name,
      content: [{ type: "text", text: step.resultText }],
    });
  }
}
