import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { SupervisorDb } from "../../db/db.js";
import type { Agent, Session } from "../../types.js";
import { ExternalSessionRuntime } from "./external-session-runtime.js";
import type { ExternalInteractionResponse } from "../managed-session-runtime.js";

type JsonObject = Record<string, any>;

function externalConfig(agent: Agent): { command: string; args: string[] } {
  const external = agent.meta.external as { command?: unknown; args?: unknown } | undefined;
  return {
    command:
      typeof external?.command === "string" && external.command.length > 0
        ? external.command
        : "codex",
    args: Array.isArray(external?.args)
      ? external.args.filter((value): value is string => typeof value === "string")
      : [],
  };
}

export class CodexSessionRuntime extends ExternalSessionRuntime {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  private nextRequestId = 1;
  private threadId = "";
  private activeTurnId: string | null = null;
  private turnCompletion: { resolve: () => void; reject: (error: Error) => void } | undefined;
  private readonly interactions = new Map<
    string,
    { requestId: number; method: string; params: JsonObject }
  >();

  private constructor(options: {
    db: SupervisorDb;
    session: Session;
    agent: Agent;
    child: ChildProcessWithoutNullStreams;
  }) {
    super(options);
    this.child = options.child;
    const lines = createInterface({ input: this.child.stdout });
    let processing = Promise.resolve();
    lines.on("line", (line) => {
      processing = processing.then(() => this.handleLine(line));
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      const message = chunk.trim();
      if (message) console.error(`[codex:${this.id}] ${message}`);
    });
    this.child.once("exit", (code, signal) => {
      const error = new Error(`Codex app-server exited (${signal ?? code ?? "unknown"})`);
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
      this.turnCompletion?.reject(error);
      this.turnCompletion = undefined;
    });
  }

  static async create(options: {
    db: SupervisorDb;
    session: Session;
    agent: Agent;
  }): Promise<CodexSessionRuntime> {
    const config = externalConfig(options.agent);
    const child = spawn(config.command, [...config.args, "app-server", "--stdio"], {
      cwd: options.session.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const runtime = new CodexSessionRuntime({ ...options, child });
    try {
      await runtime.request("initialize", {
        clientInfo: { name: "pi-supervisor", title: "Pi Supervisor", version: "0.1.0" },
        capabilities: { experimentalApi: true, requestAttestation: false },
      });
      runtime.notify("initialized");
      const savedId = options.session.meta?.externalSessionId;
      const response =
        typeof savedId === "string" && savedId.length > 0
          ? await runtime.request("thread/resume", {
              threadId: savedId,
              cwd: options.session.cwd,
              approvalPolicy: "on-request",
              sandbox: "workspace-write",
            })
          : await runtime.request("thread/start", {
              cwd: options.session.cwd,
              approvalPolicy: "on-request",
              sandbox: "workspace-write",
            });
      runtime.threadId = response.thread.id;
      runtime.setExternalSessionId(runtime.threadId);
      return runtime;
    } catch (error) {
      child.kill();
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start Codex: ${detail}`);
    }
  }

  private send(message: JsonObject): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private request(method: string, params: unknown): Promise<any> {
    const id = this.nextRequestId++;
    this.send({ method, id, params });
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  private notify(method: string, params?: unknown): void {
    this.send(params === undefined ? { method } : { method, params });
  }

  private async handleLine(line: string): Promise<void> {
    let message: JsonObject;
    try {
      message = JSON.parse(line) as JsonObject;
    } catch {
      return;
    }
    if (typeof message.id === "number" && ("result" in message || "error" in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error)
        pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && typeof message.method === "string") {
      await this.handleServerRequest(message.id, message.method, message.params ?? {});
      return;
    }
    if (typeof message.method === "string")
      await this.handleNotification(message.method, message.params);
  }

  private async handleServerRequest(
    requestId: number,
    method: string,
    params: JsonObject,
  ): Promise<void> {
    const kind = method === "item/tool/requestUserInput" ? "question" : "approval";
    const supported =
      kind === "question" ||
      method === "item/commandExecution/requestApproval" ||
      method === "item/fileChange/requestApproval" ||
      method === "item/permissions/requestApproval";
    if (!supported) {
      this.send({ id: requestId, result: { decision: "decline" } });
      return;
    }

    const interactionId = `codex-${requestId}`;
    this.interactions.set(interactionId, { requestId, method, params });
    await this.startTool(interactionId, "external_interaction", {
      externalInteraction: true,
      interactionId,
      backend: "codex",
      kind,
      title: kind === "question" ? "Codex 需要你的回答" : "Codex 请求操作权限",
      detail: params.reason ?? params.command ?? params.cwd ?? "",
      questions: params.questions ?? [],
      request: params,
    });
  }

  resolveExternalInteraction(
    interactionId: string,
    response: ExternalInteractionResponse,
  ): boolean {
    const pending = this.interactions.get(interactionId);
    if (!pending) return false;
    this.interactions.delete(interactionId);

    let result: JsonObject;
    if (pending.method === "item/tool/requestUserInput") {
      result = {
        answers: Object.fromEntries(
          Object.entries(response.answers ?? {}).map(([id, answers]) => [id, { answers }]),
        ),
      };
    } else if (pending.method === "item/permissions/requestApproval") {
      result = {
        permissions: response.action.startsWith("approve") ? pending.params.permissions : {},
        scope: response.action === "approve_session" ? "session" : "turn",
      };
    } else {
      result = {
        decision:
          response.action === "approve_session"
            ? "acceptForSession"
            : response.action === "approve"
              ? "accept"
              : response.action === "cancel"
                ? "cancel"
                : "decline",
      };
    }
    this.send({ id: pending.requestId, result });
    void this.endTool(interactionId, { action: response.action, answers: response.answers });
    return true;
  }

  private async handleNotification(method: string, params: JsonObject): Promise<void> {
    if (method === "item/agentMessage/delta") {
      await this.appendText(params.delta ?? "");
      return;
    }
    if (method === "item/reasoning/summaryTextDelta" || method === "item/reasoning/textDelta") {
      await this.appendThinking(params.delta ?? "");
      return;
    }
    if (method === "item/started") {
      const tool = this.toolFromItem(params.item);
      if (tool) await this.startTool(params.item.id, tool.name, tool.args);
      return;
    }
    if (method === "item/completed") {
      const tool = this.toolFromItem(params.item);
      if (tool) {
        const status = params.item.status;
        await this.endTool(
          params.item.id,
          params.item,
          status === "failed" || status === "declined",
        );
      }
      return;
    }
    if (method === "turn/completed" && params.threadId === this.threadId) {
      const completion = this.turnCompletion;
      this.turnCompletion = undefined;
      this.activeTurnId = null;
      if (params.turn?.status === "failed") {
        completion?.reject(new Error(params.turn.error?.message ?? "Codex turn failed"));
      } else {
        completion?.resolve();
      }
    }
  }

  private toolFromItem(item: JsonObject | undefined): { name: string; args: unknown } | null {
    if (!item) return null;
    if (item.type === "commandExecution") {
      return { name: "shell_command", args: { command: item.command, cwd: item.cwd } };
    }
    if (item.type === "fileChange") return { name: "apply_patch", args: item.changes };
    if (item.type === "mcpToolCall") {
      return { name: `${item.server}/${item.tool}`, args: item.arguments };
    }
    if (item.type === "dynamicToolCall") return { name: item.tool, args: item.arguments };
    if (item.type === "webSearch") return { name: "web_search", args: { query: item.query } };
    if (item.type === "collabAgentToolCall")
      return { name: item.tool, args: { prompt: item.prompt } };
    return null;
  }

  protected async runExternalTurn(message: string, images?: ImageContent[]): Promise<void> {
    const completion = new Promise<void>((resolve, reject) => {
      this.turnCompletion = { resolve, reject };
    });
    try {
      const response = await this.request("turn/start", {
        threadId: this.threadId,
        input: [
          { type: "text", text: message },
          ...(images ?? []).map((image) => ({
            type: "image",
            url: `data:${image.mimeType};base64,${image.data}`,
          })),
        ],
      });
      this.activeTurnId = response.turn.id;
      await completion;
    } catch (error) {
      this.turnCompletion = undefined;
      throw error;
    }
  }

  protected async interruptExternal(): Promise<void> {
    if (!this.activeTurnId) return;
    await this.request("turn/interrupt", {
      threadId: this.threadId,
      turnId: this.activeTurnId,
    });
  }

  protected async disposeExternal(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => {
      this.child.once("exit", () => resolve());
    });
    this.child.stdin.end();
    this.child.kill();
    await exited;
  }
}
