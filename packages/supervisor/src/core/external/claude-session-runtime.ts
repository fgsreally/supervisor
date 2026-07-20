import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  query,
  type PermissionResult,
  type CanUseTool,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { SupervisorDb } from "../../db/db.js";
import type { Agent, Session } from "../../types.js";
import type {
  ExternalInteractionRequest,
  ExternalInteractionResponse,
} from "../managed-session-runtime.js";
import type { SlashCommandInfo } from "../session-runtime.js";
import { ExternalSessionRuntime } from "./external-session-runtime.js";
import { getExternalAgentConfig, resolveExecutable } from "./external-agent-config.js";

type JsonObject = Record<string, any>;

class MessageQueue implements AsyncIterable<SDKUserMessage> {
  private readonly values: SDKUserMessage[] = [];
  private readonly waiters: Array<(value: IteratorResult<SDKUserMessage>) => void> = [];
  private closed = false;

  push(value: SDKUserMessage): void {
    if (this.closed) throw new Error("Claude Code input is closed");
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.values.push(value);
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value) return Promise.resolve({ value, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

export class ClaudeSessionRuntime extends ExternalSessionRuntime {
  private readonly input = new MessageQueue();
  private readonly query: Query;
  private readonly reader: Promise<void>;
  private sawTextDelta = false;
  private slashCommands: SlashCommandInfo[] = [];
  private readonly streamedTools = new Map<number, { id: string; name: string; json: string }>();
  private turnCompletion: { resolve: () => void; reject: (error: Error) => void } | undefined;
  private readonly interactions = new Map<
    string,
    { resolve: (response: ExternalInteractionResponse) => void }
  >();

  private constructor(options: {
    db: SupervisorDb;
    session: Session;
    agent: Agent;
    queryFactory?: typeof query;
  }) {
    super(options);
    const config = getExternalAgentConfig(options.agent);
    const executable = resolveExecutable(config.command, { ...process.env, ...config.env });
    if (!executable) throw new Error(`未找到用户安装的 Claude Code：${config.command}`);
    const savedId = options.session.meta?.externalSessionId;
    this.query = (options.queryFactory ?? query)({
      prompt: this.input,
      options: {
        cwd: options.session.cwd,
        pathToClaudeCodeExecutable: executable,
        env: { ...process.env, ...config.env },
        includePartialMessages: true,
        persistSession: true,
        settingSources: ["user", "project", "local"],
        resume: typeof savedId === "string" && savedId ? savedId : undefined,
        canUseTool: (toolName, input, context) => this.handlePermission(toolName, input, context),
        spawnClaudeCodeProcess: (spawnOptions) =>
          spawn(executable, [...config.args, ...spawnOptions.args], {
            cwd: spawnOptions.cwd,
            env: spawnOptions.env,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
          }),
      },
    });
    this.reader = this.readMessages();
  }

  static async create(options: {
    db: SupervisorDb;
    session: Session;
    agent: Agent;
    queryFactory?: typeof query;
  }): Promise<ClaudeSessionRuntime> {
    return new ClaudeSessionRuntime(options);
  }

  protected async runExternalTurn(message: string, images?: ImageContent[]): Promise<void> {
    if (this.turnCompletion) throw new Error(`Claude Code session ${this.id} is already running`);
    this.sawTextDelta = false;
    const completion = new Promise<void>((resolve, reject) => {
      this.turnCompletion = { resolve, reject };
    });
    this.input.push({
      type: "user",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [
          { type: "text", text: message },
          ...(images ?? []).map((image) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: image.mimeType,
              data: image.data,
            },
          })),
        ],
      },
    });
    await completion;
  }

  private async readMessages(): Promise<void> {
    try {
      for await (const message of this.query) await this.handleMessage(message);
      this.turnCompletion?.reject(new Error("Claude Code process exited"));
    } catch (error) {
      this.turnCompletion?.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.turnCompletion = undefined;
    }
  }

  private async handleMessage(message: SDKMessage): Promise<void> {
    const raw = message as JsonObject;
    if (typeof raw.session_id === "string" && raw.session_id) {
      this.setExternalSessionId(raw.session_id);
    }
    if (raw.type === "stream_event") {
      await this.handleStreamEvent(raw.event);
      return;
    }
    if (raw.type === "system" && raw.subtype === "init" && Array.isArray(raw.slash_commands)) {
      this.slashCommands = raw.slash_commands.map((name: string) => ({ name, description: "" }));
      return;
    }
    if (raw.type === "system" && raw.subtype === "commands_changed") {
      this.slashCommands = (raw.commands ?? []).map((command: JsonObject) => ({
        name: command.name,
        description: command.description ?? "",
      }));
      return;
    }
    if (raw.type === "system" && raw.subtype === "task_started" && !raw.skip_transcript) {
      await this.startTool(
        `claude-task-${raw.task_id}`,
        raw.subagent_type ?? raw.task_type ?? "Task",
        {
          description: raw.description,
          prompt: raw.prompt,
        },
      );
      return;
    }
    if (raw.type === "system" && raw.subtype === "task_notification" && !raw.skip_transcript) {
      await this.endTool(
        `claude-task-${raw.task_id}`,
        { summary: raw.summary, outputFile: raw.output_file, usage: raw.usage },
        raw.status === "failed",
      );
      return;
    }
    if (raw.type === "assistant") {
      await this.handleAssistantMessage(raw.message);
      return;
    }
    if (raw.type === "user") {
      await this.handleToolResults(raw.message);
      return;
    }
    if (raw.type === "result") {
      const completion = this.turnCompletion;
      this.turnCompletion = undefined;
      if (!completion) return;
      if (raw.is_error || raw.subtype !== "success") {
        completion.reject(new Error(raw.result || "Claude Code turn failed"));
      } else completion.resolve();
    }
  }

  private async handleStreamEvent(event: JsonObject | undefined): Promise<void> {
    if (!event) return;
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      this.sawTextDelta = true;
      await this.appendText(event.delta.text ?? "");
    } else if (event.type === "content_block_delta" && event.delta?.type === "thinking_delta") {
      await this.appendThinking(event.delta.thinking ?? "");
    } else if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
      this.streamedTools.set(event.index, {
        id: event.content_block.id,
        name: event.content_block.name,
        json: Object.keys(event.content_block.input ?? {}).length
          ? JSON.stringify(event.content_block.input)
          : "",
      });
    } else if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
      const tool = this.streamedTools.get(event.index);
      if (tool) tool.json += event.delta.partial_json ?? "";
    } else if (event.type === "content_block_stop") {
      const tool = this.streamedTools.get(event.index);
      if (tool) {
        this.streamedTools.delete(event.index);
        let input: unknown = {};
        try {
          input = tool.json ? JSON.parse(tool.json) : {};
        } catch {
          input = { rawInput: tool.json };
        }
        await this.startTool(tool.id, tool.name, input);
      }
    }
  }

  private async handleAssistantMessage(message: JsonObject | undefined): Promise<void> {
    if (!Array.isArray(message?.content)) return;
    for (const block of message.content) {
      if (block.type === "text" && !this.sawTextDelta) await this.appendText(block.text ?? "");
      if (block.type === "tool_use") await this.startTool(block.id, block.name, block.input ?? {});
    }
  }

  private async handleToolResults(message: JsonObject | undefined): Promise<void> {
    if (!Array.isArray(message?.content)) return;
    for (const block of message.content) {
      if (block.type === "tool_result")
        await this.endTool(block.tool_use_id, block.content, block.is_error === true);
    }
  }

  private async handlePermission(
    toolName: string,
    input: Record<string, unknown>,
    context: Parameters<CanUseTool>[2],
  ): Promise<PermissionResult> {
    if (
      this.session.branchType === "btw" &&
      /^(Write|Edit|MultiEdit|NotebookEdit|Bash|Task|KillShell|EnterWorktree|ExitWorktree)$/i.test(
        toolName,
      )
    ) {
      return { behavior: "deny", message: "BTW sessions are read-only." };
    }
    const isQuestion = toolName === "AskUserQuestion" && Array.isArray(input.questions);
    const response = await this.requestExternalInteraction({
      backend: "claude",
      kind: isQuestion ? "question" : "approval",
      title: isQuestion
        ? "Claude Code 请求输入"
        : (context.title ?? `Claude Code 请求执行 ${toolName}`),
      detail: [
        context.displayName,
        context.description,
        context.decisionReason,
        context.blockedPath,
      ]
        .filter(Boolean)
        .join("\n"),
      request: { toolName, input, ...context },
      questions: isQuestion ? (input.questions as unknown[]) : undefined,
    });
    if (response.action === "approve" || response.action === "approve_session") {
      return {
        behavior: "allow",
        updatedInput: input,
        updatedPermissions: response.action === "approve_session" ? context.suggestions : undefined,
      };
    }
    if (response.action === "answer") {
      return {
        behavior: "allow",
        updatedInput: {
          ...input,
          answers: Object.fromEntries(
            Object.entries(response.answers ?? {}).map(([key, values]) => [key, values.join(", ")]),
          ),
        },
      };
    }
    return { behavior: "deny", message: response.action === "cancel" ? "用户取消" : "用户拒绝" };
  }

  protected async interruptExternal(): Promise<void> {
    await this.query.interrupt();
  }

  protected async disposeExternal(): Promise<void> {
    this.input.close();
    this.query.close();
    await this.reader.catch(() => {});
  }

  getSlashCommands(): SlashCommandInfo[] {
    return this.slashCommands;
  }

  requestExternalInteraction(
    request: ExternalInteractionRequest,
  ): Promise<ExternalInteractionResponse> {
    const interactionId = `claude-${randomUUID()}`;
    void this.startTool(interactionId, "external_interaction", {
      externalInteraction: true,
      interactionId,
      ...request,
    });
    return new Promise((resolve) => this.interactions.set(interactionId, { resolve }));
  }

  resolveExternalInteraction(
    interactionId: string,
    response: ExternalInteractionResponse,
  ): boolean {
    const pending = this.interactions.get(interactionId);
    if (!pending) return false;
    this.interactions.delete(interactionId);
    pending.resolve(response);
    void this.endTool(interactionId, { action: response.action }, response.action === "deny");
    return true;
  }
}
