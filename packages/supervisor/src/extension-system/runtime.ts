/**
 * Supervisor Extension System - Runtime
 *
 * 扩展运行时，管理扩展的生命周期、事件处理、工具注册等
 */

import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import type { TSchema } from "typebox";
import { Context } from "../core/context.js";
import type {
  EventHandlerContext,
  ExtensionDefinition,
  ExtensionEvent,
  ExtensionRegistry,
  LoadedExtension,
  ToolDefinition,
  ToolExecutionContext,
  ToolInfo,
} from "./types.js";
import shadowAgentExtension from "./extensions/shadow-agent/index.js";
import subagentExtension from "./extensions/subagent/index.js";
import { ExtensionSessionServices } from "./extension-session-services.js";

/**
 * 扩展运行时
 */
export class ExtensionRuntime {
  private handlers = new Map<string, Set<(event: unknown, ctx: EventHandlerContext) => unknown>>();
  private handlerOwners = new WeakMap<Function, string>();
  private extensions: LoadedExtension[] = [];
  private registry: ExtensionRegistry;
  private readonly context: Context;
  readonly services: ExtensionSessionServices;
  private turnId = 0;

  constructor(context: Context) {
    this.context = context;
    this.services = context.services;
    this.registry = {
      extensions: this.extensions,
      tools: new Map(),
      getTool: (name: string) => this.registry.tools.get(name)?.definition,
      getAllTools: () => Array.from(this.registry.tools.values()),
    };
    context.attachExtensionHost({
      emit: (event) => this.emit(event),
      listTools: () => this.getAllTools(),
      on: (extensionId, event, handler) => this.on(extensionId, event, handler),
      registerTool: (extensionId, definition) => this.registerTool(extensionId, definition),
      unregisterTool: (extensionId, name) => this.unregisterTool(extensionId, name),
    });
  }

  async loadBuiltinExtensions(): Promise<void> {
    const sessionMeta = await this.context.session.meta.get();
    if (typeof sessionMeta.shadowOf === "number") {
      await this.loadExtension(shadowAgentExtension, "builtin:shadow-child");
    }
    if (this.context.session.isMain) {
      await this.loadExtension(subagentExtension, "builtin:subagent");
    }
  }

  /**
   * 绑定事件处理器
   */
  on<T extends ExtensionEvent>(
    extensionId: string,
    event: T["type"],
    handler: (event: T, ctx: EventHandlerContext) => void | Promise<void>,
  ): () => void {
    const handlers = this.handlers.get(event) ?? new Set();
    handlers.add(handler as (event: unknown, ctx: EventHandlerContext) => unknown);
    this.handlerOwners.set(handler, extensionId);
    this.handlers.set(event, handlers);

    return () => {
      handlers.delete(handler as (event: unknown, ctx: EventHandlerContext) => unknown);
      this.handlerOwners.delete(handler);
    };
  }

  /**
   * 触发事件
   */
  async emit<T extends ExtensionEvent>(event: T): Promise<void> {
    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.size === 0) return;

    const eventCtx: EventHandlerContext = {
      sessionId: this.context.session.id,
      timestamp: Date.now(),
    };

    for (const handler of handlers) {
      try {
        await handler(event, eventCtx);
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
      handlers: new Map(),
      tools: new Map(),
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
    this.registry.tools.set(definition.name, {
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      source: "extension",
      extensionName: extensionId,
      definition: definition as ToolDefinition<TSchema, unknown>,
    });
  }

  private unregisterTool(extensionId: string, name: string): void {
    const tool = this.registry.tools.get(name);
    if (tool?.extensionName === extensionId) this.registry.tools.delete(name);
  }

  private removeExtensionResources(extensionId: string): void {
    for (const [name, tool] of this.registry.tools) {
      if (tool.extensionName === extensionId) this.registry.tools.delete(name);
    }
    for (const handlers of this.handlers.values()) {
      for (const handler of handlers) {
        if (this.handlerOwners.get(handler) === extensionId) handlers.delete(handler);
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
      definition,
    });
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
      for (const handler of handlers) {
        try {
          await handler(event, eventCtx);
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
