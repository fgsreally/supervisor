import { AsyncLocalStorage } from "node:async_hooks";
import type { TSchema } from "typebox";
import type {
  AgentPluginContext,
  AgentPluginDefinition,
  PluginCleanup,
  PluginCommandDefinition,
  PluginEventHandlerOptions,
  PluginSession,
  SessionPluginDefinition,
  SessionRemoveReason,
  SessionSetupReason,
  ToolDefinition,
  ToolInfo,
} from "../types.js";
import type { Context } from "./context.js";

function hasGitAndServicePlugins(runtime: AgentPluginRuntime): boolean {
  const owners = new Set(runtime.loadedPluginNames());
  return owners.has("git") && owners.has("service");
}

interface SetupHandler {
  owner: string;
  priority: number;
  handler: (
    session: PluginSession,
    reason: SessionSetupReason,
  ) => void | PluginCleanup | Promise<void | PluginCleanup>;
}

interface RemoveHandler {
  owner: string;
  priority: number;
  handler: (
    session: PluginSession,
    reason: SessionRemoveReason,
  ) => void | Promise<void>;
}

interface LoadedAgentPlugin {
  name: string;
  cleanup?: PluginCleanup;
}

interface SessionScope {
  context: Context;
  cleanups: PluginCleanup[];
  owners: Set<string>;
}

/** Shared plugin generation for one Agent. Session hosts attach lightweight scopes to it. */
export class AgentPluginRuntime {
  private representative: Context;
  private readonly registration = new AsyncLocalStorage<{ owner: string; scope?: SessionScope }>();
  private readonly handlers: SetupHandler[] = [];
  private readonly removeHandlers: RemoveHandler[] = [];
  private readonly loaded = new Map<string, LoadedAgentPlugin>();
  private readonly tools = new Map<
    string,
    { owner: string; definition: ToolDefinition<TSchema, unknown> }
  >();
  private readonly commands = new Map<
    string,
    { owner: string; definition: PluginCommandDefinition }
  >();
  private readonly sessions = new Map<number, SessionScope>();
  private readonly disabledPolicies = new Set<string>();
  readonly context: AgentPluginContext;

  constructor(
    readonly agentId: number,
    representative: Context,
  ) {
    this.representative = representative;
    if (representative.policies.isDisabled("session-activity")) {
      this.disabledPolicies.add("session-activity");
    }

    // oxlint-disable-next-line typescript/no-this-alias -- facade getters need the runtime instance.
    const self = this;
    this.context = {
      agent: {
        get id() {
          return self.representative.agent.id;
        },
        get name() {
          return self.representative.agent.name;
        },
        get providerId() {
          return self.representative.agent.providerId;
        },
        get modelId() {
          return self.representative.agent.modelId;
        },
        get backendType() {
          return self.representative.agent.backendType;
        },
        get systemPrompt() {
          return self.representative.agent.systemPrompt;
        },
        get model() {
          return self.representative.agent.model;
        },
        get data() {
          return self.representative.agent.data;
        },
        get meta() {
          return self.representative.agent.meta;
        },
        on(event, handler, options?: PluginEventHandlerOptions) {
          if (event !== "session.setup" && event !== "session.remove") {
            throw new Error(`Unsupported Agent event: ${event}`);
          }
          const owner = self.requireRegistration().owner;
          const priority = options?.priority ?? 0;
          if (event === "session.setup") {
            self.handlers.push({
              owner,
              priority,
              handler: handler as SetupHandler["handler"],
            });
          } else {
            self.removeHandlers.push({
              owner,
              priority,
              handler: handler as RemoveHandler["handler"],
            });
          }
        },
        registerTool(definition) {
          const registration = self.requireRegistration();
          if (registration.scope) {
            registration.scope.context.agent.registerTool(definition);
          } else {
            self.registerTool(registration.owner, definition);
          }
        },
        unregisterTool(name) {
          const registration = self.requireRegistration();
          if (registration.scope) registration.scope.context.agent.unregisterTool(name);
          else self.unregisterTool(registration.owner, name);
        },
        registerCommand(name, definition) {
          const registration = self.requireRegistration();
          if (registration.scope)
            registration.scope.context.agent.registerCommand(name, definition);
          else self.registerCommand(registration.owner, name, definition);
        },
        unregisterCommand(name) {
          const registration = self.requireRegistration();
          if (registration.scope) registration.scope.context.agent.unregisterCommand(name);
          else self.unregisterCommand(registration.owner, name);
        },
        registerSlash(name, definition) {
          const registration = self.requireRegistration();
          if (registration.scope) registration.scope.context.agent.registerSlash(name, definition);
          else self.registerCommand(registration.owner, name, definition);
        },
        unregisterSlash(name) {
          const registration = self.requireRegistration();
          if (registration.scope) registration.scope.context.agent.unregisterSlash(name);
          else self.unregisterCommand(registration.owner, name);
        },
        listTools() {
          const scoped = self.registration.getStore()?.scope;
          if (scoped) return scoped.context.agent.listTools();
          return [...self.tools.values()].map(({ owner, definition }) => ({
            name: definition.name,
            description: definition.description,
            parameters: definition.parameters,
            source: "plugin" as const,
            pluginName: owner,
            active: definition.active !== false,
            definition,
          }));
        },
        getTool(name) {
          return this.listTools().find((tool: ToolInfo) => tool.name === name);
        },
        findByTag(tag) {
          return self.representative.agent.findByTag(tag);
        },
        findByRole(role) {
          return self.representative.agent.findByRole(role);
        },
        setModel(provider, modelId) {
          return self.representative.agent.setModel(provider, modelId);
        },
        setThinkingLevel(level) {
          self.representative.agent.setThinkingLevel(level);
        },
        getThinkingLevel() {
          return self.representative.agent.getThinkingLevel();
        },
      },
      policies: {
        disable(id) {
          self.disabledPolicies.add(id);
        },
        isDisabled(id) {
          return self.disabledPolicies.has(id);
        },
      },
      capabilities: {
        provide(name, api) {
          self.representative.capabilities.provide(name, api);
        },
        get(name) {
          return self.representative.capabilities.get(name);
        },
      },
      get db() {
        return self.representative.db;
      },
      get ui() {
        return self.representative.ui;
      },
      get events() {
        return self.representative.events;
      },
      get watson() {
        return self.representative.watson;
      },
      log(level, message, meta) {
        self.representative.log(level, message, meta);
      },
      exec(command, args, options) {
        return self.representative.exec(command, args, options);
      },
    };
  }

  isPolicyDisabled(id: string): boolean {
    return this.disabledPolicies.has(id);
  }

  disablePolicy(id: string): void {
    this.disabledPolicies.add(id);
  }

  loadedPluginNames(): string[] {
    return [...this.loaded.keys()];
  }

  async load(definition: AgentPluginDefinition): Promise<void> {
    const owner = definition.name;
    if (this.loaded.has(owner)) return;
    const cleanup = await this.registration.run({ owner }, () => definition.setup(this.context));
    this.loaded.set(owner, { name: owner, ...(cleanup ? { cleanup } : {}) });
  }

  /** Transitional adapter: the definition body becomes the per-Session setup handler. */
  async loadSessionPlugin(
    definition: SessionPluginDefinition,
    options?: { priority?: number },
  ): Promise<void> {
    await this.load({
      name: definition.name,
      scope: "agent",
      setup: (agentContext) => {
        agentContext.agent.on(
          "session.setup",
          (session) => {
            const scope = this.sessions.get(session.id);
            if (!scope) throw new Error(`Session scope ${session.id} is unavailable`);
            return definition.setup(scope.context);
          },
          { priority: options?.priority ?? 0 },
        );
      },
    });
  }

  async loadSessionPluginFactory(
    name: string,
    factory: (context: Context) => SessionPluginDefinition,
    options?: { when?: (context: Context) => boolean; priority?: number },
  ): Promise<void> {
    await this.load({
      name,
      scope: "agent",
      setup: (agentContext) => {
        agentContext.agent.on(
          "session.setup",
          (session) => {
            const scope = this.sessions.get(session.id);
            if (!scope) throw new Error(`Session scope ${session.id} is unavailable`);
            if (options?.when && !options.when(scope.context)) return;
            return factory(scope.context).setup(scope.context);
          },
          { priority: options?.priority ?? 0 },
        );
      },
    });
  }

  async attach(context: Context, reason: SessionSetupReason): Promise<void> {
    this.representative = context;
    await this.detach(context.session.id);
    const scope: SessionScope = { context, cleanups: [], owners: new Set() };
    this.sessions.set(context.session.id, scope);

    for (const { owner, definition } of this.tools.values()) {
      scope.owners.add(owner);
      context.runPluginSync(owner, () => context.agent.registerTool(definition));
    }
    for (const [name, { owner, definition }] of this.commands) {
      scope.owners.add(owner);
      context.runPluginSync(owner, () => context.agent.registerSlash(name, definition));
    }

    if (!context.session.isMain || !hasGitAndServicePlugins(this)) {
      // policy.active registers session.on listeners; those need an active plugin owner.
      scope.owners.add("session-activity");
      await context.runPlugin("session-activity", () => {
        context.session.policy?.active?.("session-activity");
      });
    }

    const handlers = [...this.handlers].sort((left, right) => right.priority - left.priority);
    try {
      for (const entry of handlers) {
        scope.owners.add(entry.owner);
        const cleanup = await this.registration.run({ owner: entry.owner, scope }, () =>
          context.runPlugin(entry.owner, () =>
            entry.handler(context.session, reason),
          ),
        );
        if (cleanup) scope.cleanups.push(cleanup);
      }
    } catch (error) {
      await this.detach(context.session.id);
      throw error;
    }
  }

  async remove(session: PluginSession, reason: SessionRemoveReason): Promise<void> {
    const handlers = [...this.removeHandlers].sort((left, right) => right.priority - left.priority);
    for (const entry of handlers) {
      await this.registration.run({ owner: entry.owner }, () =>
        entry.handler(session, reason),
      );
    }
  }

  async detach(sessionId: number): Promise<void> {
    const scope = this.sessions.get(sessionId);
    if (!scope) return;
    this.sessions.delete(sessionId);
    try {
      await this.remove(scope.context.session, "shutdown");
      for (const cleanup of scope.cleanups.reverse()) await cleanup();
    } finally {
      for (const owner of scope.owners) scope.context.removePluginResources(owner);
    }
  }

  async dispose(): Promise<void> {
    for (const sessionId of this.sessions.keys()) await this.detach(sessionId);
    for (const plugin of [...this.loaded.values()].reverse()) await plugin.cleanup?.();
    this.loaded.clear();
    this.handlers.length = 0;
    this.removeHandlers.length = 0;
    this.tools.clear();
    this.commands.clear();
  }

  private registerTool<TParams extends TSchema, TResult>(
    owner: string,
    definition: ToolDefinition<TParams, TResult>,
  ): void {
    const normalized = definition as ToolDefinition<TSchema, unknown>;
    this.tools.set(definition.name, { owner, definition: normalized });
    for (const scope of this.sessions.values()) {
      scope.context.runPluginSync(owner, () => scope.context.agent.registerTool(normalized));
    }
  }

  private unregisterTool(owner: string, name: string): void {
    if (this.tools.get(name)?.owner !== owner) return;
    this.tools.delete(name);
    for (const scope of this.sessions.values()) {
      scope.context.runPluginSync(owner, () => scope.context.agent.unregisterTool(name));
    }
  }

  private registerCommand(
    owner: string,
    name: string,
    definition: PluginCommandDefinition,
  ): void {
    this.commands.set(name, { owner, definition });
    for (const scope of this.sessions.values()) {
      scope.context.runPluginSync(owner, () =>
        scope.context.agent.registerSlash(name, definition),
      );
    }
  }

  private unregisterCommand(owner: string, name: string): void {
    if (this.commands.get(name)?.owner !== owner) return;
    this.commands.delete(name);
    for (const scope of this.sessions.values()) {
      scope.context.runPluginSync(owner, () => scope.context.agent.unregisterSlash(name));
    }
  }

  private requireRegistration(): { owner: string; scope?: SessionScope } {
    const registration = this.registration.getStore();
    if (!registration) {
      throw new Error("Agent plugin resources can only be registered in setup or session.setup");
    }
    return registration;
  }
}
