/**
 * Wecode Plugin System - Runtime
 *
 * 插件运行时，管理插件的生命周期、事件处理、工具注册等
 */

import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import type { TSchema } from "typebox";
import { Context } from "./context.js";
import {
  createSkillPlugin,
  evalPlugin,
  mcpPlugin,
  messageAssetsPlugin,
  subagentPlugin,
  wecodeAdminPlugin,
  taskManagementPlugin,
  timerPlugin,
  toolLoopGuardPlugin,
  type EventHandlerContext,
  type PluginDefinition,
  type PluginCommandDefinition,
  type PluginCommandInfo,
  type PluginEvent,
  type PluginEventHandlerMode,
  type PluginEventHandlerOptions,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolInfo,
} from "../index.js";
import { SessionPluginServices } from "./services.js";

interface LoadedPlugin {
  name: string;
  path: string;
  resolvedPath: string;
  source: "global" | "project" | "builtin";
  cleanup?: () => void | Promise<void>;
}

interface PluginRegistry {
  plugins: LoadedPlugin[];
  tools: Map<string, ToolInfo>;
  commands: Map<string, PluginCommandInfo>;
  getTool(name: string): ToolDefinition<TSchema, unknown> | undefined;
  getAllTools(): ToolInfo[];
}

interface RegisteredEventHandler {
  handler: (event: unknown, ctx: EventHandlerContext) => unknown;
  priority: number;
  mode: PluginEventHandlerMode;
  order: number;
}

/**
 * 插件运行时
 */
export class SessionPluginRuntime {
  private handlers = new Map<string, RegisteredEventHandler[]>();
  private handlerOwners = new WeakMap<Function, string>();
  private handlerRegistrationOrder = 0;
  private plugins: LoadedPlugin[] = [];
  private registry: PluginRegistry;
  private readonly context: Context;
  readonly services: SessionPluginServices;
  private turnId = 0;

  constructor(context: Context) {
    this.context = context;
    this.services = context.services;
    this.registry = {
      plugins: this.plugins,
      tools: new Map(),
      commands: new Map(),
      getTool: (name: string) => this.registry.tools.get(name)?.definition,
      getAllTools: () => Array.from(this.registry.tools.values()),
    };
    context.attachPluginHost({
      emit: (event) => this.emit(event),
      listTools: () => this.getAllTools(),
      setToolsActive: (names, active) => this.setToolsActive(names, active),
      on: (pluginId, event, handler) => this.on(pluginId, event, handler),
      registerTool: (pluginId, definition) => this.registerTool(pluginId, definition),
      unregisterTool: (pluginId, name) => this.unregisterTool(pluginId, name),
      registerCommand: (pluginId, name, definition) =>
        this.registerCommand(pluginId, name, definition),
      unregisterCommand: (pluginId, name) => this.unregisterCommand(pluginId, name),
      callTool: (name, params, signal) => this.callRegisteredTool(name, params, signal),
      removeResources: (pluginId) => this.removePluginResources(pluginId),
    });
  }

  async loadBuiltinPlugins(
    enabledSlugs?: ReadonlySet<string>,
    options?: { exclude?: ReadonlySet<string> },
  ): Promise<void> {
    const allow = (slug: string) =>
      !options?.exclude?.has(slug) && (enabledSlugs == null || enabledSlugs.has(slug));
    if (allow("wecode-admin")) {
      await this.loadPlugin(wecodeAdminPlugin, "builtin:wecode-admin");
    }
    if (allow("eval")) await this.loadPlugin(evalPlugin, "builtin:eval");
    if (allow("task-management")) {
      await this.loadPlugin(taskManagementPlugin, "builtin:task-management");
    }
    if (allow("tool-loop-guard")) {
      await this.loadPlugin(toolLoopGuardPlugin, "builtin:tool-loop-guard");
    }
    if (allow("timer")) await this.loadPlugin(timerPlugin, "builtin:timer");
    if (allow("skill")) {
      await this.loadPlugin(createSkillPlugin(this.context.agentResource), "builtin:skill");
    }
    if (allow("mcp")) await this.loadPlugin(mcpPlugin, "builtin:mcp");
    if (allow("message-assets")) {
      await this.loadPlugin(messageAssetsPlugin, "builtin:message-assets");
    }
    if (this.context.session.isMain && allow("subagent")) {
      await this.loadPlugin(subagentPlugin, "builtin:subagent");
    }
  }

  /**
   * 绑定事件处理器
   */
  on<K extends PluginEvent["type"]>(
    pluginId: string,
    event: K,
    handler: (
      event: Extract<PluginEvent, { type: K }>,
      ctx: EventHandlerContext,
    ) => void | Promise<void>,
    options?: PluginEventHandlerOptions,
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
    this.handlerOwners.set(handler, pluginId);

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
  async emit<T extends PluginEvent>(event: T): Promise<void> {
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
   * 加载插件
   */
  async loadPlugin(definition: PluginDefinition, path: string): Promise<void> {
    const loaded: LoadedPlugin = {
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
      const cleanup = await this.context.runPlugin(definition.name, async () => {
        return await definition.setup(this.context);
      });
      if (cleanup) {
        loaded.cleanup = cleanup;
      }
    } catch (err) {
      this.removePluginResources(definition.name);
      this.context.log("error", `Plugin ${definition.name} setup failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    this.plugins.push(loaded);
    this.context.log("info", `Plugin ${definition.name} loaded`);
    await this.emit({
      type: "plugin.reload",
      reason: "auto",
    });
  }

  /**
   * 卸载所有插件
   */
  async unloadAll(): Promise<void> {
    for (const ext of this.plugins) {
      try {
        if (ext.cleanup) {
          await ext.cleanup();
        }
      } catch (err) {
        this.context.log("error", `Plugin ${ext.name} cleanup failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        this.removePluginResources(ext.name);
      }
    }
    // Keep registry.plugins and this.plugins backed by the same array.
    this.plugins.length = 0;
    this.handlers.clear();
    this.registry.tools.clear();
    this.registry.commands.clear();
  }

  async unloadPlugin(pluginId: string): Promise<boolean> {
    const index = this.plugins.findIndex((plugin) => plugin.name === pluginId);
    if (index < 0) return false;

    const plugin = this.plugins[index];
    try {
      await plugin.cleanup?.();
    } catch (error) {
      this.context.log("error", `Plugin ${plugin.name} cleanup failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.removePluginResources(plugin.name);
      this.plugins.splice(index, 1);
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
   * 获取所有工具（仅插件注册表）
   */
  getAllTools(): ToolInfo[] {
    return this.registry.getAllTools();
  }

  private registerTool<TParams extends TSchema, TResult>(
    pluginId: string,
    definition: ToolDefinition<TParams, TResult>,
  ): void {
    const active = definition.active !== false;
    this.registry.tools.set(definition.name, {
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      source: "plugin",
      pluginName: pluginId,
      active,
      definition: definition as ToolDefinition<TSchema, unknown>,
    });
    this.services.tools.noteRegistered(definition.name, active);
  }

  private unregisterTool(pluginId: string, name: string): void {
    const tool = this.registry.tools.get(name);
    if (tool?.pluginName === pluginId) {
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

  /** Active tool names among currently registered plugin tools (+ optional extras). */
  listActiveToolNames(extraNames: string[] = []): string[] {
    const names = new Set<string>(extraNames);
    for (const tool of this.registry.tools.values()) names.add(tool.name);
    return this.services.tools.filterActiveNames([...names]);
  }

  private registerCommand(
    pluginId: string,
    name: string,
    definition: PluginCommandDefinition,
  ): void {
    const normalized = name.trim().replace(/^\//, "").toLowerCase();
    if (!normalized || /\s/.test(normalized)) throw new Error(`Invalid slash command: ${name}`);
    this.registry.commands.set(normalized, {
      name: normalized,
      description: definition.description,
      pluginName: pluginId,
      definition,
    });
  }

  private unregisterCommand(pluginId: string, name: string): void {
    const command = this.registry.commands.get(name.replace(/^\//, "").toLowerCase());
    if (command?.pluginName === pluginId) this.registry.commands.delete(command.name);
  }

  getAllCommands(): PluginCommandInfo[] {
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

  removePluginResources(pluginId: string): void {
    for (const [name, tool] of this.registry.tools) {
      if (tool.pluginName === pluginId) this.registry.tools.delete(name);
    }
    for (const [name, command] of this.registry.commands) {
      if (command.pluginName === pluginId) this.registry.commands.delete(name);
    }
    for (const handlers of this.handlers.values()) {
      for (let index = handlers.length - 1; index >= 0; index--) {
        const entry = handlers[index];
        if (this.handlerOwners.get(entry.handler) === pluginId) {
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
      pluginName: packageId,
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
    const toolCallId = `plugin-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
