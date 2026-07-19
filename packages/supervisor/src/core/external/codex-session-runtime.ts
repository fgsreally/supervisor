import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { SupervisorDb } from "../../db/db.js";
import type { Agent, Session } from "../../types.js";
import { ExternalSessionRuntime } from "./external-session-runtime.js";
import type { ExternalInteractionResponse } from "../managed-session-runtime.js";
import { getExternalAgentConfig } from "./external-agent-config.js";

type JsonObject = Record<string, any>;

const CODEX_CLIENT_COMMANDS = [
  ["model", "选择 Codex 模型和推理强度"],
  ["compact", "压缩当前 Codex 上下文"],
  ["status", "查看 Codex 会话状态"],
  ["permissions", "查看或切换权限配置"],
  ["skills", "查看可用 Skills"],
  ["plan", "切换到 Plan 模式"],
  ["fast", "启用快速服务层"],
  ["personality", "切换 Codex 个性"],
  ["mcp", "查看 MCP 服务状态"],
  ["apps", "查看可用 Apps"],
  ["plugins", "查看插件"],
  ["hooks", "查看 Hooks"],
  ["usage", "查看账户用量"],
  ["review", "审查未提交改动"],
  ["goal", "设置或查看目标"],
  ["rename", "重命名 Codex 会话"],
  ["agent", "查看或切换子 Agent"],
  ["ps", "查看后台任务"],
  ["stop", "停止后台任务"],
  ["fork", "Fork 当前 Codex 会话"],
] as const;

const CODEX_BLOCKED_TUI_COMMANDS = [
  "ide",
  "keymap",
  "vim",
  "setup-default-sandbox",
  "sandbox-add-read-dir",
  "clear",
  "archive",
  "delete",
  "copy",
  "exit",
  "experimental",
  "approve",
  "memories",
  "import",
  "feedback",
  "init",
  "logout",
  "mention",
  "app",
  "side",
  "btw",
  "raw",
  "resume",
  "new",
  "quit",
  "debug-config",
  "statusline",
  "title",
  "theme",
  "pets",
  "pet",
] as const;

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
  private slashCommands: Array<{ name: string; description: string; source?: string }> = [
    ...CODEX_CLIENT_COMMANDS.map(([name, description]) => ({
      name,
      description,
      source: "client",
    })),
    ...CODEX_BLOCKED_TUI_COMMANDS.map((name) => ({
      name,
      description: "Codex TUI 命令；Web UI 尚未适配",
      source: "client",
    })),
  ];
  private readonly skills = new Map<string, { name: string; path: string }>();

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
    const config = getExternalAgentConfig(options.agent);
    const child = spawn(config.command, [...config.args, "app-server", "--stdio"], {
      cwd: options.session.cwd,
      env: { ...process.env, ...config.env },
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
      await runtime.refreshSkills().catch(() => {});
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

  private async refreshSkills(): Promise<void> {
    const response = await this.request("skills/list", { cwds: [this.session.cwd] });
    const skills = (response.data ?? []).flatMap((entry: JsonObject) => entry.skills ?? []);
    this.skills.clear();
    for (const skill of skills) {
      if (
        skill.enabled === false ||
        typeof skill.name !== "string" ||
        typeof skill.path !== "string"
      )
        continue;
      this.skills.set(skill.name.toLowerCase(), { name: skill.name, path: skill.path });
    }
    this.slashCommands = [
      ...CODEX_CLIENT_COMMANDS.map(([name, description]) => ({
        name,
        description,
        source: "client",
      })),
      ...CODEX_BLOCKED_TUI_COMMANDS.map((name) => ({
        name,
        description: "Codex TUI 命令；Web UI 尚未适配",
        source: "client",
      })),
      ...skills
        .filter((skill: JsonObject) => skill.enabled !== false)
        .map((skill: JsonObject) => ({
          name: skill.name,
          description: skill.shortDescription ?? skill.description ?? "Codex skill",
          source: "skill",
        })),
    ];
  }

  private buildUserInput(message: string, images?: ImageContent[]): JsonObject[] {
    const input: JsonObject[] = [{ type: "text", text: message, text_elements: [] }];
    const seenSkills = new Set<string>();
    for (const match of message.matchAll(/(?:^|\s)\$([\w.-]+)/g)) {
      const skill = this.skills.get((match[1] ?? "").toLowerCase());
      if (!skill || seenSkills.has(skill.path)) continue;
      seenSkills.add(skill.path);
      input.push({ type: "skill", name: skill.name, path: skill.path });
    }

    const seenMentions = new Set<string>();
    for (const match of message.matchAll(/(?:^|\s)@(?:"([^"]+)"|([^\s]+))/g)) {
      const name = (match[1] ?? match[2] ?? "").trim();
      if (!name) continue;
      const path = resolve(this.session.cwd, name);
      if (!existsSync(path) || seenMentions.has(path)) continue;
      seenMentions.add(path);
      input.push({ type: "mention", name, path });
    }

    input.push(
      ...(images ?? []).map((image) => ({
        type: "image",
        url: `data:${image.mimeType};base64,${image.data}`,
      })),
    );
    return input;
  }

  async listModels(): Promise<JsonObject[]> {
    const models: JsonObject[] = [];
    let cursor: string | null = null;
    do {
      const response = await this.request("model/list", {
        cursor,
        limit: 100,
        includeHidden: false,
      });
      models.push(...(response.data ?? []));
      cursor = response.nextCursor ?? null;
    } while (cursor);
    return models;
  }

  async updateThreadSettings(settings: { model: string; effort?: string | null }): Promise<void> {
    await this.request("thread/settings/update", {
      threadId: this.threadId,
      model: settings.model,
      effort: settings.effort ?? undefined,
    });
  }

  async executeClientCommand(command: string, argument?: string): Promise<JsonObject> {
    switch (command) {
      case "compact":
        return this.request("thread/compact/start", { threadId: this.threadId });
      case "status":
        return this.request("thread/read", { threadId: this.threadId, includeTurns: false });
      case "permissions":
        if (argument) {
          await this.request("thread/settings/update", {
            threadId: this.threadId,
            permissions: argument,
          });
          return { ok: true, selected: argument };
        }
        return this.request("permissionProfile/list", { cwd: this.session.cwd, limit: 100 });
      case "skills":
        return this.request("skills/list", { cwds: [this.session.cwd], forceReload: true });
      case "plan": {
        const status = await this.request("thread/read", {
          threadId: this.threadId,
          includeTurns: false,
        });
        const settings = status.thread?.settings ?? {};
        await this.request("thread/settings/update", {
          threadId: this.threadId,
          collaborationMode: {
            mode: "plan",
            settings: {
              model: settings.model ?? "",
              reasoning_effort: settings.effort ?? null,
              developer_instructions: null,
            },
          },
        });
        return { ok: true, mode: "plan" };
      }
      case "fast":
        await this.request("thread/settings/update", {
          threadId: this.threadId,
          serviceTier: argument === "off" ? null : "fast",
        });
        return { ok: true, fast: argument !== "off" };
      case "personality":
        if (!argument || !["none", "friendly", "pragmatic"].includes(argument)) {
          return { choices: ["none", "friendly", "pragmatic"] };
        }
        await this.request("thread/settings/update", {
          threadId: this.threadId,
          personality: argument,
        });
        return { ok: true, personality: argument };
      case "mcp":
        return this.request("mcpServerStatus/list", {
          threadId: this.threadId,
          detail: "full",
          limit: 100,
        });
      case "apps":
        return this.request("app/list", { threadId: this.threadId, limit: 100 });
      case "plugins":
        return this.request("plugin/list", { cwds: [this.session.cwd] });
      case "hooks":
        return this.request("hooks/list", { cwds: [this.session.cwd] });
      case "usage":
        return this.request("account/usage/read", {});
      case "review":
        return this.request("review/start", {
          threadId: this.threadId,
          target: argument
            ? { type: "custom", instructions: argument }
            : { type: "uncommittedChanges" },
          delivery: "inline",
        });
      case "goal":
        return argument
          ? this.request("thread/goal/set", { threadId: this.threadId, objective: argument })
          : this.request("thread/goal/get", { threadId: this.threadId });
      case "rename":
        if (!argument) throw new Error("/rename 需要会话名称");
        await this.request("thread/name/set", { threadId: this.threadId, name: argument });
        return { ok: true, name: argument };
      default:
        throw new Error(`Codex 命令 /${command} 尚未在 Web UI 中适配`);
    }
  }

  getSlashCommands(): Array<{ name: string; description: string; source?: string }> {
    return this.slashCommands;
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
    const isMcpElicitation = method === "mcpServer/elicitation/request";
    const kind =
      method === "item/tool/requestUserInput" || (isMcpElicitation && params.mode !== "url")
        ? "question"
        : "approval";
    const supported =
      kind === "question" ||
      method === "item/commandExecution/requestApproval" ||
      method === "item/fileChange/requestApproval" ||
      method === "item/permissions/requestApproval" ||
      isMcpElicitation;
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
      title: isMcpElicitation
        ? `MCP ${params.serverName ?? ""} 请求输入`
        : kind === "question"
          ? "Codex 需要你的回答"
          : "Codex 请求操作权限",
      detail: params.message ?? params.reason ?? params.command ?? params.cwd ?? "",
      questions: isMcpElicitation ? this.mcpElicitationQuestions(params) : (params.questions ?? []),
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
    if (pending.method === "mcpServer/elicitation/request") {
      const accepted =
        response.action === "approve" ||
        response.action === "approve_session" ||
        response.action === "answer";
      result = {
        action: response.action === "cancel" ? "cancel" : accepted ? "accept" : "decline",
        content: accepted ? this.mcpElicitationContent(pending.params, response.answers) : null,
        _meta: pending.params._meta ?? null,
      };
    } else if (pending.method === "item/tool/requestUserInput") {
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

  private mcpElicitationQuestions(params: JsonObject): JsonObject[] {
    if (params.mode === "url") return [];
    const schema = params.requestedSchema;
    const properties = schema?.properties ?? {};
    const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
    return Object.entries(properties).map(([id, raw]) => {
      const property = (raw ?? {}) as JsonObject;
      const values = Array.isArray(property.enum) ? property.enum : [];
      return {
        id,
        header: property.title ?? id,
        question: property.description ?? property.title ?? id,
        isOther: !values.length,
        isSecret: property.format === "password",
        required: required.has(id),
        options: values.map((value: unknown) => ({ label: String(value), description: "" })),
      };
    });
  }

  private mcpElicitationContent(
    params: JsonObject,
    answers?: Record<string, string[]>,
  ): JsonObject {
    const properties = params.requestedSchema?.properties ?? {};
    return Object.fromEntries(
      Object.entries(answers ?? {}).map(([id, values]) => {
        const value = values[0] ?? "";
        const type = properties[id]?.type;
        if (type === "boolean") return [id, value === "true"];
        if (type === "integer") return [id, Number.parseInt(value, 10)];
        if (type === "number") return [id, Number(value)];
        return [id, value];
      }),
    );
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
        input: this.buildUserInput(message, images),
      });
      this.activeTurnId = response.turn.id;
      await completion;
    } catch (error) {
      this.turnCompletion = undefined;
      throw error;
    }
  }

  override async steer(message: string, images?: ImageContent[]): Promise<void> {
    if (!this.activeTurnId) {
      await super.steer(message, images);
      return;
    }
    await this.request("turn/steer", {
      threadId: this.threadId,
      expectedTurnId: this.activeTurnId,
      input: this.buildUserInput(message, images),
    });
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
