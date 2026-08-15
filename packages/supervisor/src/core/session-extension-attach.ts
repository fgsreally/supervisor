import type { AgentTool, SessionTreeEntry, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { AgentResource } from "../agent/runtime-resources.js";
import { BUILTIN_EXTENSION_SLUGS } from "../extension/builtin/catalog.js";
import {
  createSkillExtension,
  evalExtension,
  gitExtension,
  mcpExtension,
  messageAssetsExtension,
  persistentBashExtension,
  projectServicesExtension,
  subagentExtension,
  supervisorAdminExtension,
  taskManagementExtension,
  timerExtension,
  toolLoopGuardExtension,
} from "../extension/builtin/index.js";
import { listEnabledBuiltinExtensionSlugs } from "../extension/builtin/ensure.js";
import { isAgentExtension } from "../extension/index.js";
import { sessionActivityPolicy } from "../extension/policies/session-activity.js";
import {
  AgentExtensionRuntime,
  Context,
  SessionExtensionHost,
} from "../extension/runtime/index.js";
import type { SupervisorDb } from "../db/db.js";
import { ensureProjectDir, ensureSessionDir } from "./session-files.js";
import type {
  ExternalInteractionRequest,
  ExternalInteractionResponse,
  ManagedSessionRuntime,
} from "./managed-session-runtime.js";
import type { SessionManager } from "./session-manager.js";
import type { SessionState, SlashCommandInfo } from "./session-runtime.js";
import type { SessionPromptImage } from "./session-media.js";
import { writeLog } from "../i18n/logs.js";
import type { SessionSetupReason } from "../extension/types.js";

const agentExtensionRuntimes = new WeakMap<SessionManager, Map<number, AgentExtensionRuntime>>();

export function isAgentPolicyDisabled(
  manager: SessionManager,
  agentId: number,
  policyId: string,
): boolean {
  return agentExtensionRuntimes.get(manager)?.get(agentId)?.isPolicyDisabled(policyId) ?? false;
}

export async function disposeAgentExtensionRuntime(
  manager: SessionManager,
  agentId: number,
): Promise<void> {
  const runtimes = agentExtensionRuntimes.get(manager);
  const runtime = runtimes?.get(agentId);
  if (!runtime) return;
  runtimes?.delete(agentId);
  await runtime.dispose();
}

function getAgentExtensionRuntime(
  manager: SessionManager,
  agentId: number,
  context: Context,
): AgentExtensionRuntime {
  let runtimes = agentExtensionRuntimes.get(manager);
  if (!runtimes) {
    runtimes = new Map();
    agentExtensionRuntimes.set(manager, runtimes);
  }
  let runtime = runtimes.get(agentId);
  if (!runtime) {
    runtime = new AgentExtensionRuntime(agentId, context);
    runtimes.set(agentId, runtime);
  }
  return runtime;
}

export async function loadSessionExtensions(options: {
  runtime: ManagedSessionRuntime;
  agentId: number;
  agentName: string;
  cwd: string;
  db: SupervisorDb;
  manager: SessionManager;
  resource: AgentResource;
  setupReason?: SessionSetupReason;
}): Promise<SessionExtensionHost | null> {
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
  const extension = new SessionExtensionHost(context);

  await options.manager.ensureResourceCatalog();
  const enabledBuiltins = listEnabledBuiltinExtensionSlugs(options.db, options.agentId);
  // Built-ins are Agent-owned extensions too; the Session host only provides their scoped surface.
  await extension.initialize(enabledBuiltins, { exclude: BUILTIN_EXTENSION_SLUGS });

  const extensionSlugs = options.db
    .listAgentResourceBindings(options.agentId, { kind: "extension", enabledOnly: false })
    .flatMap((binding) => {
      const slug = binding.resource?.slug;
      if (!slug || BUILTIN_EXTENSION_SLUGS.has(slug)) return [];
      return [slug];
    });
  const modules = options.manager.getExtensionRegistry().getMany(extensionSlugs);
  const agentRuntime = getAgentExtensionRuntime(options.manager, options.agentId, context);
  const enabled = (slug: string) => enabledBuiltins == null || enabledBuiltins.has(slug);
  const loadBuiltin = async (
    slug: string,
    definition: Parameters<AgentExtensionRuntime["loadSessionExtension"]>[0],
  ) => {
    if (enabled(slug)) await agentRuntime.loadSessionExtension(definition);
  };
  // Preparation-sensitive extensions are registered first so their session.setup handlers run first.
  await loadBuiltin("git", gitExtension);
  await loadBuiltin("supervisor-admin", supervisorAdminExtension);
  await loadBuiltin("eval", evalExtension);
  await loadBuiltin("task-management", taskManagementExtension);
  await loadBuiltin("tool-loop-guard", toolLoopGuardExtension);
  await loadBuiltin("timer", timerExtension);
  await loadBuiltin("persistent-bash", persistentBashExtension);
  if (enabled("skill")) {
    await agentRuntime.loadSessionExtensionFactory("skill", (scope) =>
      createSkillExtension(scope.agentResource),
    );
  }
  await loadBuiltin("mcp", mcpExtension);
  await loadBuiltin("message-assets", messageAssetsExtension);
  if (enabled("subagent")) {
    await agentRuntime.loadSessionExtensionFactory("subagent", () => subagentExtension, {
      when: (scope) => scope.session.isMain,
    });
  }
  if (enabled("project-services")) {
    await agentRuntime.loadSessionExtensionFactory(
      "project-services",
      () => projectServicesExtension,
      { when: (scope) => scope.session.isMain },
    );
  }
  const agentModules = modules.filter(
    (module) => !module.error && isAgentExtension(module.definition),
  );
  for (const module of agentModules) {
    if (isAgentExtension(module.definition)) {
      await agentRuntime.load(module.definition);
    }
  }
  const moduleErrors = modules.flatMap((module) =>
    module.error ? [{ slug: module.slug, error: module.error }] : [],
  );
  for (const module of modules) {
    if (module.error || isAgentExtension(module.definition)) continue;
    await agentRuntime.loadSessionExtension(module.definition);
  }
  for (const moduleError of moduleErrors) {
    writeLog("error", "runtime.extensionAttachFailed", {
      slug: moduleError.slug,
      error: moduleError.error,
    });
  }
  if (context.policies.isDisabled("session-activity")) {
    agentRuntime.disablePolicy("session-activity");
  }
  if (!agentRuntime.isPolicyDisabled("session-activity")) {
    await agentRuntime.load(sessionActivityPolicy, { policy: true });
  }

  await agentRuntime.attach(context, options.setupReason ?? "restored");
  extension.addScopeCleanup(() => agentRuntime.detach(options.runtime.id));

  return extension;
}

/** Placeholder runtime so session.setup can prepare cwd before the CLI process spawns. */
export class ExtensionAttachRuntime implements ManagedSessionRuntime {
  private target: ManagedSessionRuntime | null = null;
  private host: SessionExtensionHost | null = null;

  constructor(readonly id: number) {}

  get extension(): SessionExtensionHost | null {
    return this.host ?? this.target?.extension ?? null;
  }

  attachExtension(host: SessionExtensionHost): void {
    this.host = host;
    this.target?.attachExtension?.(host);
  }

  setTarget(runtime: ManagedSessionRuntime): void {
    this.target = runtime;
    if (this.host) runtime.attachExtension?.(this.host);
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

  async deactivateExtension(extensionId: string): Promise<boolean> {
    return (await this.target?.deactivateExtension(extensionId)) ?? false;
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
