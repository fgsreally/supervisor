import type { AgentTool, SessionTreeEntry, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { AgentResource } from "../../agent/runtime-resources.js";
import { BUILTIN_PLUGIN_SLUGS } from "../../plugin/builtin/catalog.js";
import {
  createSkillPlugin,
  evalPlugin,
  gitPlugin,
  mcpPlugin,
  messageAssetsPlugin,
  projectServicesPlugin,
  subagentPlugin,
  wecodeAdminPlugin,
  taskManagementPlugin,
  timerPlugin,
  toolLoopGuardPlugin,
} from "../../plugin/builtin/index.js";
import { listEnabledBuiltinPluginSlugs } from "../../plugin/builtin/ensure.js";
import { isAgentPlugin } from "../../plugin/index.js";
import {
  AgentPluginRuntime,
  Context,
  SessionPluginHost,
} from "../../plugin/runtime/index.js";
import type { WecodeDb } from "../../db/db.js";
import { ensureProjectDir, ensureSessionDir } from "./session-files.js";
import type {
  ExternalInteractionRequest,
  ExternalInteractionResponse,
  ManagedSessionRuntime,
} from "./managed-session-runtime.js";
import type { SessionManager } from "./session-manager.js";
import type { SessionState, SlashCommandInfo } from "./session-runtime.js";
import type { SessionPromptImage } from "./session-media.js";
import { sessionLogEvent } from "../../utils/session-log.js";
import type { SessionSetupReason } from "../../plugin/types.js";

const agentPluginRuntimes = new WeakMap<SessionManager, Map<number, AgentPluginRuntime>>();

export function isAgentPolicyDisabled(
  manager: SessionManager,
  agentId: number,
  policyId: string,
): boolean {
  return agentPluginRuntimes.get(manager)?.get(agentId)?.isPolicyDisabled(policyId) ?? false;
}

export async function disposeAgentPluginRuntime(
  manager: SessionManager,
  agentId: number,
): Promise<void> {
  const runtimes = agentPluginRuntimes.get(manager);
  const runtime = runtimes?.get(agentId);
  if (!runtime) return;
  runtimes?.delete(agentId);
  await runtime.dispose();
}

function getAgentPluginRuntime(
  manager: SessionManager,
  agentId: number,
  context: Context,
): AgentPluginRuntime {
  let runtimes = agentPluginRuntimes.get(manager);
  if (!runtimes) {
    runtimes = new Map();
    agentPluginRuntimes.set(manager, runtimes);
  }
  let runtime = runtimes.get(agentId);
  if (!runtime) {
    runtime = new AgentPluginRuntime(agentId, context);
    runtimes.set(agentId, runtime);
  }
  return runtime;
}

export async function loadSessionPlugins(options: {
  runtime: ManagedSessionRuntime;
  agentId: number;
  agentName: string;
  cwd: string;
  db: WecodeDb;
  manager: SessionManager;
  resource: AgentResource;
  setupReason?: SessionSetupReason;
}): Promise<SessionPluginHost | null> {
  const session = options.manager.get(options.runtime.id);
  if (session?.projectId == null) return null;

  await ensureProjectDir(session.projectId);
  await ensureSessionDir(session.projectId, options.runtime.id);

  const context = new Context({
    sessionManager: options.manager,
    db: options.db,
    sessionRuntime: options.runtime,
    resource: options.resource,
  });
  const plugin = new SessionPluginHost(context);

  await options.manager.ensureResourceCatalog();
  const enabledBuiltins = listEnabledBuiltinPluginSlugs(options.db, options.agentId);
  // Built-ins are Agent-owned plugins too; the Session host only provides their scoped surface.
  await plugin.initialize(enabledBuiltins, { exclude: BUILTIN_PLUGIN_SLUGS });

  const pluginSlugs = options.db
    .listAgentResourceBindings(options.agentId, { kind: "plugin", enabledOnly: false })
    .flatMap((binding) => {
      const slug = binding.resource?.slug;
      if (!slug || BUILTIN_PLUGIN_SLUGS.has(slug)) return [];
      return [slug];
    });
  const modules = options.manager.getPluginRegistry().getMany(pluginSlugs);
  const agentRuntime = getAgentPluginRuntime(options.manager, options.agentId, context);
  const enabled = (slug: string) => enabledBuiltins == null || enabledBuiltins.has(slug);
  const loadBuiltin = async (
    slug: string,
    definition: Parameters<AgentPluginRuntime["loadSessionPlugin"]>[0],
    priority?: number,
  ) => {
    if (enabled(slug)) await agentRuntime.loadSessionPlugin(definition, { priority });
  };
  // Preparation-sensitive plugins are registered first so their session.setup handlers run first.
  await loadBuiltin("git", gitPlugin, 200);
  await loadBuiltin("wecode-admin", wecodeAdminPlugin);
  await loadBuiltin("eval", evalPlugin);
  await loadBuiltin("task-management", taskManagementPlugin);
  await loadBuiltin("tool-loop-guard", toolLoopGuardPlugin);
  await loadBuiltin("timer", timerPlugin);
  if (enabled("skill")) {
    await agentRuntime.loadSessionPluginFactory("skill", (scope) =>
      createSkillPlugin(scope.agentResource),
    );
  }
  await loadBuiltin("mcp", mcpPlugin);
  await loadBuiltin("message-assets", messageAssetsPlugin);
  if (enabled("subagent")) {
    await agentRuntime.loadSessionPluginFactory("subagent", () => subagentPlugin, {
      when: (scope) => scope.session.isMain,
    });
  }
  if (enabled("service")) {
    await agentRuntime.loadSessionPluginFactory("service", () => projectServicesPlugin, {
      when: (scope) => scope.session.isMain,
      priority: 100,
    });
  }
  const agentModules = modules.filter(
    (module) => !module.error && isAgentPlugin(module.definition),
  );
  for (const module of agentModules) {
    if (isAgentPlugin(module.definition)) {
      await agentRuntime.load(module.definition);
    }
  }
  const moduleErrors = modules.flatMap((module) =>
    module.error ? [{ slug: module.slug, error: module.error }] : [],
  );
  for (const module of modules) {
    if (module.error || isAgentPlugin(module.definition)) continue;
    await agentRuntime.loadSessionPlugin(module.definition);
  }
  for (const moduleError of moduleErrors) {
    sessionLogEvent(options.runtime.id, "error", "runtime.pluginAttachFailed", {
      slug: moduleError.slug,
      error: moduleError.error,
    });
  }

  await agentRuntime.attach(context, options.setupReason ?? "restore");
  plugin.addScopeCleanup(() => agentRuntime.detach(options.runtime.id));

  return plugin;
}

/** Placeholder runtime so session.setup can prepare cwd before the CLI process spawns. */
export class PluginAttachRuntime implements ManagedSessionRuntime {
  private target: ManagedSessionRuntime | null = null;
  private host: SessionPluginHost | null = null;

  constructor(readonly id: number) {}

  get plugin(): SessionPluginHost | null {
    return this.host ?? this.target?.plugin ?? null;
  }

  attachPlugin(host: SessionPluginHost): void {
    this.host = host;
    this.target?.attachPlugin?.(host);
  }

  setTarget(runtime: ManagedSessionRuntime): void {
    this.target = runtime;
    if (this.host) runtime.attachPlugin?.(this.host);
  }

  subscribe(
    listener: Parameters<ManagedSessionRuntime["subscribe"]>[0],
  ): ReturnType<ManagedSessionRuntime["subscribe"]> {
    return this.requireTarget().subscribe(listener);
  }

  async clear(): Promise<void> {
    await this.target?.clear();
  }

  async prompt(
    message: string,
    images?: SessionPromptImage[],
    source?: string | null,
    origin?: string,
  ): Promise<void> {
    await this.requireTarget().prompt(message, images, source, origin);
  }

  steer(message: string, images?: SessionPromptImage[]): void | Promise<void> {
    return this.requireTarget().steer(message, images);
  }

  followUp(message: string, source?: string | null, images?: SessionPromptImage[]): void {
    this.requireTarget().followUp(message, source, images);
  }

  async abort(): Promise<void> {
    await this.requireTarget().abort();
  }

  async waitForIdle(): Promise<void> {
    await this.requireTarget().waitForIdle();
  }

  compact(customInstructions?: string): Promise<{
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    details?: unknown;
  }> {
    return this.requireTarget().compact(customInstructions);
  }

  reloadMessagesFromSessionTree(): Promise<void> {
    return this.requireTarget().reloadMessagesFromSessionTree();
  }

  setModel(provider: string, modelId: string): Promise<Model<any>> {
    return this.requireTarget().setModel(provider, modelId);
  }

  setThinkingLevel(level: ThinkingLevel): Promise<void> {
    return this.requireTarget().setThinkingLevel(level);
  }

  setActiveTools(toolNames: string[]): Promise<void> {
    return this.requireTarget().setActiveTools(toolNames);
  }

  setTools(tools: AgentTool[], activeToolNames?: string[]): Promise<void> {
    return this.requireTarget().setTools(tools, activeToolNames);
  }

  syncActiveTools(): Promise<void> {
    return this.target?.syncActiveTools() ?? Promise.resolve();
  }

  getMessages(): Promise<SessionTreeEntry[]> {
    return this.requireTarget().getMessages();
  }

  getState(): Promise<SessionState> {
    return this.requireTarget().getState();
  }

  getSlashCommands(): SlashCommandInfo[] {
    return this.target?.getSlashCommands() ?? [];
  }

  executeSlashCommand?(name: string, args: string): Promise<void> {
    const target = this.requireTarget();
    if (!target.executeSlashCommand) {
      throw new Error("Slash commands are unavailable");
    }
    return target.executeSlashCommand(name, args);
  }

  getLastAssistantText(): string | undefined {
    return this.target?.getLastAssistantText();
  }

  async deactivatePlugin(pluginId: string): Promise<boolean> {
    return (await this.target?.deactivatePlugin(pluginId)) ?? false;
  }

  resolveExternalInteraction?(
    interactionId: string,
    response: ExternalInteractionResponse,
  ): boolean {
    return this.target?.resolveExternalInteraction?.(interactionId, response) ?? false;
  }

  requestExternalInteraction?(
    request: ExternalInteractionRequest,
  ): Promise<ExternalInteractionResponse> {
    const target = this.requireTarget();
    if (!target.requestExternalInteraction) {
      throw new Error("External interaction is unavailable");
    }
    return target.requestExternalInteraction(request);
  }

  private requireTarget(): ManagedSessionRuntime {
    if (!this.target) throw new Error("External runtime is not ready");
    return this.target;
  }
}
