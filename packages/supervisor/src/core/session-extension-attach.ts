import type { AgentTool, SessionTreeEntry, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { AgentResource } from "../agent/runtime-resources.js";
import { BUILTIN_EXTENSION_SLUGS } from "../extension/builtin/catalog.js";
import { listEnabledBuiltinExtensionSlugs } from "../extension/builtin/ensure.js";
import type { ExtensionEvent } from "../extension/index.js";
import { Context, SessionExtensionHost } from "../extension/runtime/index.js";
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

export async function loadSessionExtensions(options: {
  runtime: ManagedSessionRuntime;
  agentId: number;
  agentName: string;
  cwd: string;
  db: SupervisorDb;
  manager: SessionManager;
  resource: AgentResource;
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
  const currentSession = options.manager.get(options.runtime.id);
  const isMainSession = currentSession?.parentId == null;
  const enabledBuiltins = listEnabledBuiltinExtensionSlugs(options.db, options.agentId, {
    isMainSession,
  });
  await extension.initialize(enabledBuiltins);

  const agent = options.db.getAgent(options.agentId);
  const toolsPreset = agent?.toolsPreset ?? "coding";
  const spawnType = currentSession?.spawnType ?? null;
  const createEvent = {
    type: "session.create",
    sessionId: options.runtime.id,
    parentSessionId: currentSession?.parentId ? String(currentSession.parentId) : undefined,
    cwd: options.cwd,
    toolsPreset,
    spawnType,
    agentDisplayName: options.agentName,
  } as ExtensionEvent;

  await extension.emit(createEvent);
  await extension.emit({ ...createEvent, type: "session.prepare" } as ExtensionEvent);

  const extensionSlugs = options.db
    .listAgentResourceBindings(options.agentId, { kind: "extension", enabledOnly: false })
    .flatMap((binding) => {
      const slug = binding.resource?.slug;
      if (!slug || BUILTIN_EXTENSION_SLUGS.has(slug)) return [];
      return [slug];
    });
  const moduleErrors = await extension.loadModules(
    options.manager.getExtensionRegistry().getMany(extensionSlugs),
  );
  for (const moduleError of moduleErrors) {
    console.error(`extension module [${moduleError.slug}]:`, moduleError.error);
  }

  return extension;
}

export async function startSessionExtensions(extension: SessionExtensionHost): Promise<void> {
  await extension.emit({
    type: "session.start",
    reason: "startup",
    sessionId: extension.sessionId,
  } as ExtensionEvent);
}

/** Placeholder runtime so session.create (worktree, cwd) can run before the CLI process spawns. */
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
    return this.requireTarget().syncActiveTools();
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
