import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { ToolPolicy, type ToolCallInfo, type ToolDecision } from "./tool-policy.js";

// ---------------------------------------------------------------------------
// Session tool set
// ---------------------------------------------------------------------------

export type ToolGuardHandler = (
  call: ToolCallInfo & { toolCallId: string },
) => Promise<ToolDecision | void> | ToolDecision | void;

export type ToolResultHandler = (
  call: ToolCallInfo & {
    toolCallId: string;
    result: unknown;
    setResult: (next: unknown) => void;
  },
) => Promise<void> | void;

type GuardRegistration = { handler: ToolGuardHandler; priority: number };

export class SessionToolSet {
  private policy: ToolPolicy = ToolPolicy.coding();
  private beforeHandlers: GuardRegistration[] = [];
  private afterHandlers: Array<{ handler: ToolResultHandler; priority: number }> = [];
  private disabledTools = new Map<string, string | undefined>();
  private activeToolNames: string[] | null = null;

  setPolicy(policy: ToolPolicy): void {
    this.policy = policy.clone();
  }

  getPolicy(): ToolPolicy {
    return this.policy.clone();
  }

  beforeUse(handler: ToolGuardHandler, options?: { priority?: number }): () => void {
    const entry: GuardRegistration = { handler, priority: options?.priority ?? 0 };
    this.beforeHandlers.push(entry);
    this.beforeHandlers.sort((a, b) => b.priority - a.priority);
    return () => {
      const index = this.beforeHandlers.indexOf(entry);
      if (index >= 0) this.beforeHandlers.splice(index, 1);
    };
  }

  afterUse(handler: ToolResultHandler, options?: { priority?: number }): () => void {
    const entry = { handler, priority: options?.priority ?? 0 };
    this.afterHandlers.push(entry);
    this.afterHandlers.sort((a, b) => b.priority - a.priority);
    return () => {
      const index = this.afterHandlers.indexOf(entry);
      if (index >= 0) this.afterHandlers.splice(index, 1);
    };
  }

  disable(name: string, reason?: string): void {
    this.disabledTools.set(name, reason);
  }

  enable(name: string): void {
    this.disabledTools.delete(name);
  }

  setActive(names: string[]): void {
    this.activeToolNames = [...names];
  }

  getActiveToolNames(): string[] | null {
    return this.activeToolNames ? [...this.activeToolNames] : null;
  }

  filterActiveTools(names: string[]): string[] {
    const base = this.activeToolNames ?? names;
    return base.filter((name) => {
      if (this.disabledTools.has(name)) return false;
      return this.policy.check({ name, args: {} }).allow;
    });
  }

  async checkBeforeCall(call: ToolCallInfo & { toolCallId: string }): Promise<ToolDecision> {
    if (this.disabledTools.has(call.name)) {
      return {
        allow: false,
        reason: this.disabledTools.get(call.name) ?? `Tool "${call.name}" is disabled.`,
      };
    }

    if (this.activeToolNames && !this.activeToolNames.includes(call.name)) {
      return { allow: false, reason: `Tool "${call.name}" is not in the active tool set.` };
    }

    const policyDecision = this.policy.check(call);
    if (!policyDecision.allow) return policyDecision;

    for (const { handler } of this.beforeHandlers) {
      const decision = await handler(call);
      if (decision && !decision.allow) return decision;
    }

    return { allow: true };
  }

  async runAfterCall(
    call: ToolCallInfo & { toolCallId: string; result: unknown },
    setResult: (next: unknown) => void,
  ): Promise<void> {
    for (const { handler } of this.afterHandlers) {
      await handler({ ...call, setResult });
    }
  }
}

// ---------------------------------------------------------------------------
// Turn boundary injection
// ---------------------------------------------------------------------------

export type ScheduleInjectionInput = {
  variant: string;
  content: string;
  priority?: number;
  /** Skip re-injecting full content for this many assistant turns after last inject. */
  dedupeAfterTurns?: number;
};

type StoredInjection = ScheduleInjectionInput & {
  lastInjectedTurn: number;
};

function wrapInjection(variant: string, content: string): string {
  return `<system-injection variant="${variant}">\n${content}\n</system-injection>`;
}

export class TurnInjector {
  private injections = new Map<string, StoredInjection>();
  private turnCount = 0;
  private assistantTurnsSinceInject = new Map<string, number>();

  schedule(input: ScheduleInjectionInput): void {
    const existing = this.injections.get(input.variant);
    this.injections.set(input.variant, {
      ...input,
      priority: input.priority ?? 0,
      dedupeAfterTurns: input.dedupeAfterTurns ?? 2,
      lastInjectedTurn: existing?.lastInjectedTurn ?? -1,
    });
  }

  clear(variant: string): void {
    this.injections.delete(variant);
    this.assistantTurnsSinceInject.delete(variant);
  }

  reattach(
    variant: string,
    content: string,
    options?: Omit<ScheduleInjectionInput, "variant" | "content">,
  ): void {
    this.schedule({ variant, content, ...options });
    this.assistantTurnsSinceInject.set(variant, Number.POSITIVE_INFINITY);
  }

  onTurnStart(): void {
    this.turnCount += 1;
  }

  onAssistantTurnEnd(): void {
    for (const variant of this.injections.keys()) {
      const prev = this.assistantTurnsSinceInject.get(variant) ?? Number.POSITIVE_INFINITY;
      this.assistantTurnsSinceInject.set(variant, prev === Number.POSITIVE_INFINITY ? 0 : prev + 1);
    }
  }

  applyToMessages(messages: AgentMessage[]): AgentMessage[] {
    const pending = [...this.injections.values()]
      .filter((item) => this.shouldInject(item))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    if (pending.length === 0) return messages;

    const content = pending.map((item) => wrapInjection(item.variant, item.content)).join("\n\n");
    for (const item of pending) {
      item.lastInjectedTurn = this.turnCount;
      this.assistantTurnsSinceInject.set(item.variant, 0);
    }

    const injectionMessage = {
      role: "user" as const,
      content: [{ type: "text" as const, text: content }],
      timestamp: Date.now(),
    } satisfies AgentMessage;
    return [...messages, injectionMessage];
  }

  private shouldInject(item: StoredInjection): boolean {
    if (item.lastInjectedTurn < 0) return true;
    const since = this.assistantTurnsSinceInject.get(item.variant) ?? 0;
    return since >= (item.dedupeAfterTurns ?? 2);
  }
}

// ---------------------------------------------------------------------------
// Turn flow controller
// ---------------------------------------------------------------------------

export type ContinueTurnOptions = {
  prompt?: string;
  origin?: string;
  dedupeKey?: string;
};

export type ContinueTurnResult = {
  queued: boolean;
  reason?: string;
};

export type TurnUsage = {
  turns: number;
  tokens: number;
  wallClockMs: number;
  contextTokens: number | null;
};

export type TurnFlowLock = {
  key: string;
  release(): void;
};

type FlowDeps = {
  continueTurn: (content: string, options?: { source?: string }) => Promise<void>;
  getContextUsage: () => Promise<{ tokens: number | null }>;
  isIdle: () => boolean;
  isStreaming: () => boolean;
};

export class TurnFlowController {
  private paused = false;
  private pauseReason?: string;
  private locks = new Map<string, number>();
  private dedupeTurn = new Map<string, number>();
  private turnCount = 0;
  private sessionUsage: TurnUsage = { turns: 0, tokens: 0, wallClockMs: 0, contextTokens: null };
  private scopes = new Map<string, { turns: number; tokens: number; startedAt: number }>();

  constructor(private readonly deps: FlowDeps) {}

  onTurnEnded(usage?: { input?: number; output?: number; totalTokens?: number }): void {
    this.turnCount += 1;
    this.sessionUsage.turns += 1;
    const delta = usage?.totalTokens ?? (usage?.input ?? 0) + (usage?.output ?? 0);
    this.sessionUsage.tokens += delta;
    for (const scope of this.scopes.values()) {
      scope.turns += 1;
      scope.tokens += delta;
    }
  }

  onStepEnded(usage?: { input?: number; output?: number; totalTokens?: number }): void {
    const delta = usage?.totalTokens ?? (usage?.input ?? 0) + (usage?.output ?? 0);
    this.sessionUsage.tokens += delta;
    for (const scope of this.scopes.values()) {
      scope.tokens += delta;
    }
  }

  startScope(scope: string): void {
    this.scopes.set(scope, { turns: 0, tokens: 0, startedAt: Date.now() });
  }

  endScope(scope: string): void {
    this.scopes.delete(scope);
  }

  async continue(options?: ContinueTurnOptions): Promise<ContinueTurnResult> {
    if (this.paused) {
      return { queued: false, reason: this.pauseReason ?? "paused" };
    }

    if (options?.dedupeKey) {
      const lastTurn = this.dedupeTurn.get(options.dedupeKey);
      if (lastTurn === this.turnCount) {
        return { queued: false, reason: "dedupe" };
      }
      this.dedupeTurn.set(options.dedupeKey, this.turnCount);
    }

    const origin = options?.origin ?? "extension_continue";
    const prompt = options?.prompt ?? "Continue.";
    const source = `extension:flow:${origin}`;
    await this.deps.continueTurn(prompt, { source });
    return { queued: true };
  }

  async pause(reason?: string): Promise<void> {
    this.paused = true;
    this.pauseReason = reason;
  }

  async resume(): Promise<void> {
    this.paused = false;
    this.pauseReason = undefined;
  }

  async acquireLock(key: string, options?: { ttlMs?: number }): Promise<TurnFlowLock | null> {
    const now = Date.now();
    const expires = this.locks.get(key);
    if (expires !== undefined && expires > now) return null;
    const ttl = options?.ttlMs ?? 60_000;
    this.locks.set(key, now + ttl);
    return {
      key,
      release: () => {
        this.locks.delete(key);
      },
    };
  }

  async usage(options?: { since?: "session" | "lastTurn"; scope?: string }): Promise<TurnUsage> {
    const context = await this.deps.getContextUsage();
    if (options?.scope) {
      const scoped = this.scopes.get(options.scope);
      if (scoped) {
        return {
          turns: scoped.turns,
          tokens: scoped.tokens,
          wallClockMs: Date.now() - scoped.startedAt,
          contextTokens: context.tokens,
        };
      }
    }
    return {
      ...this.sessionUsage,
      wallClockMs: this.sessionUsage.wallClockMs,
      contextTokens: context.tokens,
    };
  }
}

// ---------------------------------------------------------------------------
// UI approval
// ---------------------------------------------------------------------------

export type ApprovalAction = "approve" | "reject" | "revise";

export type ApprovalOption = {
  label: string;
  description?: string;
};

export type ApprovalRequest = {
  kind: string;
  title: string;
  body: string;
  options?: ApprovalOption[];
  actions?: ApprovalAction[];
};

export type ApprovalResult =
  | { action: "approve"; selectedOption?: string }
  | { action: "reject" }
  | { action: "revise"; feedback: string };

type PendingApproval = {
  request: ApprovalRequest;
  resolve: (result: ApprovalResult) => void;
  reject: (error: Error) => void;
};

const pendingApprovals = new Map<string, Map<string, PendingApproval>>();

export function submitApprovalResolution(
  sessionId: string | number,
  approvalId: string,
  result: ApprovalResult,
): boolean {
  const pending = pendingApprovals.get(String(sessionId))?.get(approvalId);
  if (!pending) return false;
  pending.resolve(result);
  cleanupApproval(sessionId, approvalId);
  return true;
}

export function cancelPendingApprovals(sessionId: string | number): void {
  const sessionMap = pendingApprovals.get(String(sessionId));
  if (!sessionMap) return;
  for (const [approvalId, pending] of sessionMap) {
    pending.reject(new Error("Session aborted"));
    cleanupApproval(sessionId, approvalId);
  }
}

function cleanupApproval(sessionId: string | number, approvalId: string): void {
  const key = String(sessionId);
  const sessionMap = pendingApprovals.get(key);
  sessionMap?.delete(approvalId);
  if (sessionMap && sessionMap.size === 0) pendingApprovals.delete(key);
}

export class UiApprovalService {
  constructor(
    private readonly sessionId: number,
    private readonly deps: {
      pausing: <T>(reason: string, work: Promise<T> | (() => Promise<T>)) => Promise<T>;
      broadcast: (event: Record<string, unknown>) => void;
    },
  ) {}

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    const approvalId = randomUUID();
    return this.deps.pausing(
      `approval:${request.kind}`,
      () =>
        new Promise<ApprovalResult>((resolve, reject) => {
          const key = String(this.sessionId);
          const sessionMap = pendingApprovals.get(key) ?? new Map<string, PendingApproval>();
          sessionMap.set(approvalId, { request, resolve, reject });
          pendingApprovals.set(key, sessionMap);
          this.deps.broadcast({
            type: "approval.pending",
            sessionId: this.sessionId,
            approvalId,
            ...request,
            actions: request.actions ?? ["approve", "reject", "revise"],
          });
        }),
    );
  }
}

export class ExtensionSessionServices {
  readonly tools: SessionToolSet;
  readonly inject: TurnInjector;
  readonly flow: TurnFlowController;
  readonly uiApproval: UiApprovalService;

  constructor(options: {
    sessionId: number;
    deps: FlowDeps & {
      pausing: <T>(reason: string, work: Promise<T> | (() => Promise<T>)) => Promise<T>;
      broadcast: (event: Record<string, unknown>) => void;
    };
  }) {
    this.tools = new SessionToolSet();
    this.inject = new TurnInjector();
    this.flow = new TurnFlowController({
      continueTurn: options.deps.continueTurn,
      getContextUsage: options.deps.getContextUsage,
      isIdle: options.deps.isIdle,
      isStreaming: options.deps.isStreaming,
    });
    this.uiApproval = new UiApprovalService(options.sessionId, {
      pausing: options.deps.pausing,
      broadcast: options.deps.broadcast,
    });
  }
}
