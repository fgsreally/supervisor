/**
 * Supervisor Extension System - Runtime
 *
 * 扩展运行时，管理扩展的生命周期、事件处理、工具注册等
 */

import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import type { TSchema } from "typebox";
import { Context } from "./context.js";
import {
  createSkillExtension,
  evalExtension,
  mcpExtension,
  messageAssetsExtension,
  subagentExtension,
  supervisorAdminExtension,
  taskManagementExtension,
  timerExtension,
  toolLoopGuardExtension,
  type EventHandlerContext,
  type ExtensionDefinition,
  type ExtensionCommandDefinition,
  type ExtensionCommandInfo,
  type ExtensionEvent,
  type ExtensionEventHandlerMode,
  type ExtensionEventHandlerOptions,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolInfo,
} from "../index.js";
import { SessionExtensionServices } from "./services.js";

interface LoadedExtension {
  name: string;
  path: string;
  resolvedPath: string;
  source: "global" | "project" | "builtin";
  cleanup?: () => void | Promise<void>;
}

interface ExtensionRegistry {
  extensions: LoadedExtension[];
  tools: Map<string, ToolInfo>;
  commands: Map<string, ExtensionCommandInfo>;
  getTool(name: string): ToolDefinition<TSchema, unknown> | undefined;
  getAllTools(): ToolInfo[];
}

interface RegisteredEventHandler {
  handler: (event: unknown, ctx: EventHandlerContext) => unknown;
  priority: number;
  mode: ExtensionEventHandlerMode;
  order: number;
}

/**
 * 扩展运行时
 */
export class SessionExtensionRuntime {
  private handlers = new Map<string, RegisteredEventHandler[]>();
  private handlerOwners = new WeakMap<Function, string>();
  private handlerRegistrationOrder = 0;
  private extensions: LoadedExtension[] = [];
  private registry: ExtensionRegistry;
  private readonly context: Context;
  readonly services: SessionExtensionServices;
  private turnId = 0;

  constructor(context: Context) {
    this.context = context;
    this.services = context.services;
    this.registry = {
      extensions: this.extensions,
      tools: new Map(),
      commands: new Map(),
      getTool: (name: string) => this.registry.tools.get(name)?.definition,
      getAllTools: () => Array.from(this.registry.tools.values()),
    };
    context.attachExtensionHost({
      emit: (event) => this.emit(event),
      listTools: () => this.getAllTools(),
      setToolsActive: (names, active) => this.setToolsActive(names, active),
      on: (extensionId, event, handler) => this.on(extensionId, event, handler),
      registerTool: (extensionId, definition) => this.registerTool(extensionId, definition),
      unregisterTool: (extensionId, name) => this.unregisterTool(extensionId, name),
      registerCommand: (extensionId, name, definition) =>
        this.registerCommand(extensionId, name, definition),
      unregisterCommand: (extensionId, name) => this.unregisterCommand(extensionId, name),
      callTool: (name, params, signal) => this.callRegisteredTool(name, params, signal),
      removeResources: (extensionId) => this.removeExtensionResources(extensionId),
    });
  }

  async loadBuiltinExtensions(
    enabledSlugs?: ReadonlySet<string>,
    options?: { exclude?: ReadonlySet<string> },
  ): Promise<void> {
    const allow = (slug: string) =>
      !options?.exclude?.has(slug) && (enabledSlugs == null || enabledSlugs.has(slug));
    if (allow("supervisor-admin")) {
      await this.loadExtension(supervisorAdminExtension, "builtin:supervisor-admin");
    }
    if (allow("eval")) await this.loadExtension(evalExtension, "builtin:eval");
    if (allow("task-management")) {
      await this.loadExtension(taskManagementExtension, "builtin:task-management");
    }
    if (allow("tool-loop-guard")) {
      await this.loadExtension(toolLoopGuardExtension, "builtin:tool-loop-guard");
    }
    if (allow("timer")) await this.loadExtension(timerExtension, "builtin:timer");
    if (allow("skill")) {
      await this.loadExtension(createSkillExtension(this.context.agentResource), "builtin:skill");
    }
    if (allow("mcp")) await this.loadExtension(mcpExtension, "builtin:mcp");
    if (allow("message-assets")) {
      await this.loadExtension(messageAssetsExtension, "builtin:message-assets");
    }
    if (this.context.session.isMain && allow("subagent")) {
      await this.loadExtension(subagentExtension, "builtin:subagent");
    }
  }

  /**
   * 绑定事件处理器
   */
  on<K extends ExtensionEvent["type"]>(
    extensionId: string,
    event: K,
    handler: (
      event: Extract<ExtensionEvent, { type: K }>,
      ctx: EventHandlerContext,
    ) => void | Promise<void>,
    options?: ExtensionEventHandlerOptions,
  ): () => void {
    const list = this.handlers.get(event) ?? [];
    const wrapped: RegisteredEventHandler = {
      handler: handler as (event: unknown, ctx: EventHandlerContext) => unknown,
      priority: options?.priority ?? 0,
      mode: options?.mode ?? "sync",
      order: this.handlerRegistrationOrder++,
    };
    list.push(wrapped);
    this.handlers.set(event, list);
    this.handlerOwners.set(handler, extensionId);

    return () => {
      const current = this.handlers.get(event);
      if (!current) return;
      const index = current.indexOf(wrapped);
      if (index >= 0) current.splice(index, 1);
      this.handlerOwners.delete(handler);
    };
  }

  /**
   * 触发事件：先并行启动 async handlers，再按 priority 降序 await sync handlers。
   */
  async emit<T extends ExtensionEvent>(event: T): Promise<void> {
    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.length === 0) return;

    const eventCtx: EventHandlerContext = {
      sessionId: this.context.session.id,
      timestamp: Date.now(),
    };

    const sorted = [...handlers].sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      return left.order - right.order;
    });

    for (const entry of sorted) {
      if (entry.mode !== "async") continue;
      void Promise.resolve(entry.handler(event, eventCtx)).catch((err: unknown) => {
        this.context.log("error", `Async event handler failed for ${event.type}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    for (const entry of sorted) {
      if (entry.mode === "async") continue;
      try {
        await entry.handler(event, eventCtx);
      } catch (err) {
        this.context.log("error", `Event handler failed for ${event.type}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * 加载扩展
   */
  async loadExtension(definition: ExtensionDefinition, path: string): Promise<void> {
    const loaded: LoadedExtension = {
      name: definition.name,
      path,
      resolvedPath: path,
      source: path.includes("node_modules")
        ? "builtin"
        : path.startsWith(process.cwd())
          ? "project"
          : "global",
    };

    // 调用 setup
    try {
      const cleanup = await this.context.runExtension(definition.name, async () => {
        return await definition.setup(this.context);
      });
      if (cleanup) {
        loaded.cleanup = cleanup;
      }
    } catch (err) {
      this.removeExtensionResources(definition.name);
      this.context.log("error", `Extension ${definition.name} setup failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    this.extensions.push(loaded);
    this.context.log("info", `Extension ${definition.name} loaded`);
    await this.emit({
      type: "extension.reload",
      reason: "auto",
    });
  }

  /**
   * 卸载所有扩展
   */
  async unloadAll(): Promise<void> {
    for (const ext of this.extensions) {
      try {
        if (ext.cleanup) {
          await ext.cleanup();
        }
      } catch (err) {
        this.context.log("error", `Extension ${ext.name} cleanup failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        this.removeExtensionResources(ext.name);
      }
    }
    // Keep registry.extensions and this.extensions backed by the same array.
    this.extensions.length = 0;
    this.handlers.clear();
    this.registry.tools.clear();
    this.registry.commands.clear();
  }

  async unloadExtension(extensionId: string): Promise<boolean> {
    const index = this.extensions.findIndex((extension) => extension.name === extensionId);
    if (index < 0) return false;

    const extension = this.extensions[index];
    try {
      await extension.cleanup?.();
    } catch (error) {
      this.context.log("error", `Extension ${extension.name} cleanup failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.removeExtensionResources(extension.name);
      this.extensions.splice(index, 1);
    }
    return true;
  }

  /**
   * 获取工具定义
   */
  getTool(name: string): ToolDefinition<TSchema, unknown> | undefined {
    return this.registry.getTool(name);
  }

  /**
   * 获取所有工具（仅扩展注册表）
   */
  getAllTools(): ToolInfo[] {
    return this.registry.getAllTools();
  }

  private registerTool<TParams extends TSchema, TResult>(
    extensionId: string,
    definition: ToolDefinition<TParams, TResult>,
  ): void {
    const active = definition.active !== false;
    this.registry.tools.set(definition.name, {
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      source: "extension",
      extensionName: extensionId,
      active,
      definition: definition as ToolDefinition<TSchema, unknown>,
    });
    this.services.tools.noteRegistered(definition.name, active);
  }

  private unregisterTool(extensionId: string, name: string): void {
    const tool = this.registry.tools.get(name);
    if (tool?.extensionName === extensionId) {
      this.registry.tools.delete(name);
      this.services.tools.noteUnregistered(name);
    }
  }

  setToolsActive(names: string[], active: boolean): void {
    for (const name of names) {
      const tool = this.registry.tools.get(name);
      if (tool) tool.active = active;
    }
    if (active) this.services.tools.activate(names);
    else this.services.tools.deactivate(names);
  }

  /** Active tool names among currently registered extension tools (+ optional extras). */
  listActiveToolNames(extraNames: string[] = []): string[] {
    const names = new Set<string>(extraNames);
    for (const tool of this.registry.tools.values()) names.add(tool.name);
    return this.services.tools.filterActiveNames([...names]);
  }

  private registerCommand(
    extensionId: string,
    name: string,
    definition: ExtensionCommandDefinition,
  ): void {
    const normalized = name.trim().replace(/^\//, "").toLowerCase();
    if (!normalized || /\s/.test(normalized)) throw new Error(`Invalid slash command: ${name}`);
    this.registry.commands.set(normalized, {
      name: normalized,
      description: definition.description,
      extensionName: extensionId,
      definition,
    });
  }

  private unregisterCommand(extensionId: string, name: string): void {
    const command = this.registry.commands.get(name.replace(/^\//, "").toLowerCase());
    if (command?.extensionName === extensionId) this.registry.commands.delete(command.name);
  }

  getAllCommands(): ExtensionCommandInfo[] {
    return [...this.registry.commands.values()];
  }

  async executeCommand(name: string, args: string) {
    const command = this.registry.commands.get(name.replace(/^\//, "").toLowerCase());
    if (!command) throw new Error(`Slash command /${name} not found`);
    const definition = command.definition;
    if ("template" in definition && definition.template !== undefined) {
      const prompt =
        typeof definition.template === "function"
          ? await definition.template(args)
          : definition.template.replaceAll("$ARGUMENTS", args);
      return { type: "prompt" as const, prompt };
    }
    const result = (await definition.handler(args, {
      sessionId: this.context.session.id,
      cwd: this.context.session.cwd,
    })) ?? { type: "handled" as const };
    if (result.type !== "prompt") {
      const raw = `/${command.name}${args ? ` ${args}` : ""}`;
      await this.context.session.sendMessage({
        role: "custom",
        customType: "slash_input",
        content: raw,
        display: true,
        details: { name: command.name },
      });
      await this.context.session.sendMessage({
        role: "custom",
        customType: "slash_output",
        content:
          result.type === "error"
            ? result.message
            : (result.message ?? `/${command.name} completed`),
        display: true,
        details: { name: command.name, isError: result.type === "error" },
      });
    }
    return result;
  }

  removeExtensionResources(extensionId: string): void {
    for (const [name, tool] of this.registry.tools) {
      if (tool.extensionName === extensionId) this.registry.tools.delete(name);
    }
    for (const [name, command] of this.registry.commands) {
      if (command.extensionName === extensionId) this.registry.commands.delete(name);
    }
    for (const handlers of this.handlers.values()) {
      for (let index = handlers.length - 1; index >= 0; index--) {
        const entry = handlers[index];
        if (this.handlerOwners.get(entry.handler) === extensionId) {
          handlers.splice(index, 1);
        }
      }
    }
  }

  registerPackagedTool(packageId: string, tool: AgentTool, pausing?: { message: string }): void {
    const definition: ToolDefinition<TSchema, unknown> = {
      name: tool.name,
      description: tool.description ?? tool.name,
      parameters: tool.parameters as TSchema,
      execute: async (params, context) => {
        const run = () => tool.execute(context.toolCallId, params, context.signal);
        const result = pausing
          ? await this.context.session.pausing(pausing.message, run)
          : await run();
        return result as {
          content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>;
          details?: unknown;
          isError?: boolean;
        };
      },
    };

    this.registry.tools.set(tool.name, {
      name: tool.name,
      description: tool.description ?? tool.name,
      parameters: tool.parameters as TSchema,
      source: "builtin",
      extensionName: packageId,
      active: true,
      definition,
    });
    this.services.tools.noteRegistered(tool.name, true);
  }

  logPackagedToolWarning(toolId: string, error: unknown): void {
    this.context.log("warn", `packaged tool ${toolId} skipped`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  getToolExecutionSession(): { id: string; cwd: string } {
    return { id: String(this.context.session.id), cwd: this.context.session.cwd };
  }

  /**
   * 执行工具
   */
  async executeTool(
    name: string,
    params: unknown,
    context: ToolExecutionContext,
  ): Promise<{
    content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>;
    details?: unknown;
    isError?: boolean;
  }> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }

    return await tool.execute(params, context);
  }

  private async callRegisteredTool(
    name: string,
    params: unknown,
    signal?: AbortSignal,
  ): Promise<{
    content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>;
    details?: unknown;
    isError?: boolean;
  }> {
    const toolCallId = `extension-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const decision = await this.checkToolBeforeCall(toolCallId, name, params);
    if (decision.block) {
      return {
        content: [{ type: "text", text: decision.reason ?? `Tool ${name} is blocked` }],
        isError: true,
      };
    }
    const result = await this.executeTool(name, params, {
      toolCallId,
      session: this.getToolExecutionSession(),
      signal: signal ?? this.context.session.signal,
      reportProgress: () => {},
    });
    let finalResult = result;
    await this.runToolAfterHandlers(toolCallId, name, params, result, (next) => {
      finalResult = next as typeof result;
    });
    return finalResult;
  }

  async checkToolBeforeCall(
    toolCallId: string,
    name: string,
    args: unknown,
  ): Promise<{ block: boolean; reason?: string }> {
    const event = {
      type: "tool.before_call" as const,
      toolCallId,
      name,
      args,
      entryId: "",
      block: undefined as { reason: string } | undefined,
    };

    const handlers = this.handlers.get("tool.before_call");
    if (handlers) {
      const eventCtx: EventHandlerContext = {
        sessionId: this.context.session.id,
        timestamp: Date.now(),
      };
      const sorted = [...handlers].sort((left, right) => {
        if (right.priority !== left.priority) return right.priority - left.priority;
        return left.order - right.order;
      });
      for (const entry of sorted) {
        if (entry.mode === "async") continue;
        try {
          await entry.handler(event, eventCtx);
        } catch (err) {
          this.context.log("error", "tool.before_call handler failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (event.block) {
      return { block: true, reason: event.block.reason };
    }

    const decision = await this.services.tools.checkBeforeCall({ toolCallId, name, args });
    if (!decision.allow) {
      return { block: true, reason: decision.reason };
    }
    return { block: false };
  }

  async runToolAfterHandlers(
    toolCallId: string,
    name: string,
    args: unknown,
    result: unknown,
    setResult: (next: unknown) => void,
  ): Promise<void> {
    await this.services.tools.runAfterCall({ toolCallId, name, args, result }, setResult);
  }

  applyTurnInjections(messages: AgentMessage[]): AgentMessage[] {
    return this.services.inject.applyToMessages(messages);
  }

  onTurnStarted(): number {
    this.turnId += 1;
    this.services.inject.onTurnStart();
    return this.turnId;
  }

  onTurnEnded(usage?: { input?: number; output?: number; totalTokens?: number }): number {
    this.services.flow.onTurnEnded(usage);
    this.services.inject.onAssistantTurnEnd();
    return this.turnId;
  }

  onStepEnded(usage?: { input?: number; output?: number; totalTokens?: number }): void {
    this.services.flow.onStepEnded(usage);
  }
}
