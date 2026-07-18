import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { SupervisorDb } from "../../db/db.js";
import type { Agent, Session } from "../../types.js";
import { ExternalSessionRuntime } from "./external-session-runtime.js";
import type {
  ExternalInteractionRequest,
  ExternalInteractionResponse,
} from "../managed-session-runtime.js";

type JsonObject = Record<string, any>;

function externalConfig(agent: Agent): { command: string; args: string[] } {
  const external = agent.meta.external as { command?: unknown; args?: unknown } | undefined;
  return {
    command:
      typeof external?.command === "string" && external.command.length > 0
        ? external.command
        : "claude",
    args: Array.isArray(external?.args)
      ? external.args.filter((value): value is string => typeof value === "string")
      : [],
  };
}

export class ClaudeSessionRuntime extends ExternalSessionRuntime {
  private turnProcess: ChildProcessWithoutNullStreams | null = null;
  private externalSessionId = "";
  private sawTextDelta = false;
  private readonly interactions = new Map<
    string,
    { resolve: (response: ExternalInteractionResponse) => void }
  >();

  private constructor(options: { db: SupervisorDb; session: Session; agent: Agent }) {
    super(options);
    const savedId = options.session.meta?.externalSessionId;
    this.externalSessionId = typeof savedId === "string" ? savedId : "";
  }

  static async create(options: {
    db: SupervisorDb;
    session: Session;
    agent: Agent;
  }): Promise<ClaudeSessionRuntime> {
    return new ClaudeSessionRuntime(options);
  }

  protected async runExternalTurn(message: string, images?: ImageContent[]): Promise<void> {
    if (images?.length)
      throw new Error("Claude Code stream-json driver does not support images yet");
    const config = externalConfig(this.agent);
    const supervisorUrl = process.env.PI_SUPERVISOR_URL;
    const permissionArgs = supervisorUrl
      ? [
          "--mcp-config",
          JSON.stringify({
            mcpServers: {
              supervisor: {
                command: process.execPath,
                args: [
                  fileURLToPath(
                    new URL("./core/external/claude-permission-bridge.mjs", import.meta.url),
                  ),
                  String(this.id),
                  supervisorUrl,
                ],
              },
            },
          }),
          "--permission-prompt-tool",
          "mcp__supervisor__approve",
          "--permission-mode",
          "default",
          "--append-system-prompt",
          "When you need structured user input, call mcp__supervisor__ask and wait for its result instead of using AskUserQuestion.",
        ]
      : ["--permission-mode", "acceptEdits"];
    const args = [
      ...config.args,
      "-p",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      ...permissionArgs,
    ];
    if (this.externalSessionId) args.push("--resume", this.externalSessionId);
    const child = spawn(config.command, args, {
      cwd: this.session.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.turnProcess = child;
    this.sawTextDelta = false;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const detail = chunk.trim();
      if (detail) console.error(`[claude:${this.id}] ${detail}`);
    });
    const lines = createInterface({ input: child.stdout });
    let processing = Promise.resolve();
    lines.on("line", (line) => {
      processing = processing.then(() => this.handleLine(line));
    });
    child.stdin.end(message);

    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", async (code, signal) => {
        await processing;
        this.turnProcess = null;
        if (code === 0) resolve();
        else reject(new Error(`Claude Code exited (${signal ?? code ?? "unknown"})`));
      });
    });
  }

  private async handleLine(line: string): Promise<void> {
    let message: JsonObject;
    try {
      message = JSON.parse(line) as JsonObject;
    } catch {
      return;
    }
    if (typeof message.session_id === "string" && message.session_id.length > 0) {
      this.externalSessionId = message.session_id;
      this.setExternalSessionId(message.session_id);
    }
    if (message.type === "stream_event") {
      await this.handleStreamEvent(message.event);
      return;
    }
    if (message.type === "assistant") {
      await this.handleAssistantMessage(message.message);
      return;
    }
    if (message.type === "user") await this.handleToolResults(message.message);
  }

  private async handleStreamEvent(event: JsonObject | undefined): Promise<void> {
    if (!event) return;
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      this.sawTextDelta = true;
      await this.appendText(event.delta.text ?? "");
      return;
    }
    if (event.type === "content_block_delta" && event.delta?.type === "thinking_delta") {
      await this.appendThinking(event.delta.thinking ?? "");
      return;
    }
    if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
      await this.startTool(
        event.content_block.id,
        event.content_block.name,
        event.content_block.input ?? {},
      );
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
      if (block.type !== "tool_result") continue;
      await this.endTool(block.tool_use_id, block.content, block.is_error === true);
    }
  }

  protected async interruptExternal(): Promise<void> {
    this.turnProcess?.kill();
  }

  protected async disposeExternal(): Promise<void> {
    this.turnProcess?.kill();
    this.turnProcess = null;
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
