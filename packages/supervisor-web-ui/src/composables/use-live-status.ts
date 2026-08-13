import { watch } from "vue";
import type { LiveStatusPayload, LiveStatusPhase } from "pi-supervisor-native-bridge";

import { useSessionStore } from "@/store";
import { isNativeApp } from "./use-native-app";

let supervisorNative: typeof import("pi-supervisor-native-bridge").SupervisorNative | null = null;

/**
 * Per-session state within the current activity wave.
 * - running: agent working
 * - waiting: needs user confirmation (ask tool / external approval / blocked)
 * - error: run failed, needs user attention
 * - done: this turn finished
 */
type TrackedState = "running" | "waiting" | "error" | "done";

type TrackedSession = {
  state: TrackedState;
  title: string;
  subtitle: string;
  phase: LiveStatusPhase;
};

/** Sessions that became active during this app activity wave (running + completed). */
const tracked = new Map<string, TrackedSession>();
let liveStatusWatchStarted = false;
let publishChain: Promise<void> = Promise.resolve();

/** Transient highlight when one session just finished while others keep running. */
const RECENT_DONE_MS = 3000;
let recentDone: { sessionId: string; title: string; expiresAt: number } | null = null;
let recentDoneTimer: ReturnType<typeof setTimeout> | null = null;

function markRecentDone(sessionId: string, title: string): void {
  recentDone = { sessionId, title, expiresAt: Date.now() + RECENT_DONE_MS };
  if (recentDoneTimer) clearTimeout(recentDoneTimer);
  recentDoneTimer = setTimeout(() => {
    recentDone = null;
    recentDoneTimer = null;
    void publishLiveStatus();
  }, RECENT_DONE_MS + 100);
}

async function plugin() {
  if (!isNativeApp()) return null;
  if (!supervisorNative) {
    const mod = await import("pi-supervisor-native-bridge");
    supervisorNative = mod.SupervisorNative;
  }
  return supervisorNative;
}

function isActiveStatus(status: string | undefined | null): boolean {
  return status === "running" || status === "blocked" || status === "initializing";
}

function stateForStatus(status: string | undefined | null): TrackedState {
  if (status === "blocked") return "waiting";
  if (status === "error") return "error";
  if (isActiveStatus(status)) return "running";
  return "done";
}

function phaseForStatus(status: string | undefined | null, streaming = false): LiveStatusPhase {
  if (status === "blocked" || status === "error") return "waiting";
  if (streaming) return "thinking";
  if (status === "running") return "thinking";
  if (status === "initializing") return "connecting";
  return "idle";
}

function subtitleForStatus(status: string | undefined | null, streaming = false): string {
  if (status === "blocked") return "等待你确认";
  if (status === "error") return "出错，需要处理";
  if (streaming) return "思考中";
  if (status === "running") return "运行中";
  if (status === "initializing") return "连接中";
  return "已完成";
}

function truncateTitle(title: string, max = 12): string {
  const value = title.trim() || "会话";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function counts() {
  let running = 0;
  let waiting = 0;
  let error = 0;
  for (const entry of tracked.values()) {
    if (entry.state === "running") running += 1;
    else if (entry.state === "waiting") waiting += 1;
    else if (entry.state === "error") error += 1;
  }
  const total = tracked.size;
  const active = running + waiting;
  return { running, waiting, error, active, total, completed: total - active - error };
}

/** Build chip text within ~7 characters for the status-bar Live Update chip. */
function buildChip(active: number, total: number, allComplete: boolean): string {
  if (allComplete) return "完成";
  if (total <= 0) return "进行中";
  const ratio = `${active}/${total}`;
  return ratio.length <= 7 ? ratio : `${active}进行`;
}

/** Aggregate view priority: waiting > error > just-finished highlight > progress > all done. */
function buildPayload(): LiveStatusPayload | null {
  const { running, waiting, error, active, total, completed } = counts();
  if (total === 0) return null;

  const entries = [...tracked.entries()];
  const byState = (state: TrackedState) => entries.filter(([, entry]) => entry.state === state);
  const runningEntries = byState("running");
  const waitingEntries = byState("waiting");
  const errorEntries = byState("error");
  const doneEntries = byState("done");
  const base = { activeCount: active, completedCount: completed, totalCount: total };

  // 1. Sessions blocked on the user preempt everything: fastest path back to the app.
  if (waiting > 0) {
    const [sessionId, first] = waitingEntries[0];
    const rest = running > 0 ? ` · 另有 ${running} 个进行中` : "";
    return {
      sessionId,
      title:
        waiting === 1 ? `${truncateTitle(first.title, 10)} · 待确认` : `${waiting} 个会话待确认`,
      subtitle:
        waiting === 1 ? `需要你确认后才能继续${rest}` : `请尽快处理${rest} · 共 ${total} 个会话`,
      phase: "waiting",
      chip: waiting === 1 ? "待确认" : `${waiting}待确认`,
      ...base,
      allComplete: false,
    };
  }

  // 2. Failed sessions also need the user, slightly lower priority than confirmations.
  if (error > 0) {
    const [sessionId, first] = errorEntries[0];
    const rest = running > 0 ? ` · 另有 ${running} 个进行中` : "";
    return {
      sessionId,
      title: error === 1 ? `${truncateTitle(first.title, 10)} · 出错` : `${error} 个会话出错`,
      subtitle:
        error === 1
          ? `运行出错，需要你处理${rest}`
          : `运行出错，请逐个处理${rest} · 共 ${total} 个会话`,
      phase: "waiting",
      chip: error === 1 ? "出错" : `${error}出错`,
      ...base,
      allComplete: false,
    };
  }

  const allComplete = active === 0;
  const chip = buildChip(active, total, allComplete);

  if (allComplete) {
    const only = doneEntries.length === 1 ? doneEntries[0][1] : null;
    return {
      sessionId: doneEntries[0]?.[0] ?? "aggregate",
      title: only ? `${truncateTitle(only.title, 10)} · 已完成` : "全部任务已完成",
      subtitle:
        total === 1
          ? `「${truncateTitle(only?.title || "会话")}」本轮对话已结束`
          : `进行中 0 · 已完成 ${completed} · 共 ${total} 个会话`,
      phase: "idle",
      chip,
      activeCount: 0,
      completedCount: completed,
      totalCount: total,
      allComplete: true,
    };
  }

  // 3. One session just finished while others keep running: highlight it for a moment.
  if (
    recentDone &&
    Date.now() < recentDone.expiresAt &&
    tracked.get(recentDone.sessionId)?.state === "done"
  ) {
    return {
      sessionId: recentDone.sessionId,
      title: `${truncateTitle(recentDone.title, 10)} · 已完成`,
      subtitle: `进行中 ${active} · 已完成 ${completed}/${total}`,
      phase: "idle",
      chip,
      ...base,
      allComplete: false,
    };
  }

  const primaryRunning = runningEntries[0]?.[1];

  if (runningEntries.length === 1 && completed === 0) {
    return {
      sessionId: runningEntries[0][0],
      title: truncateTitle(primaryRunning?.title || "Supervisor", 16),
      subtitle: `${primaryRunning?.subtitle || "进行中"} · 共 1 个任务`,
      phase: primaryRunning?.phase ?? "thinking",
      chip,
      ...base,
      allComplete: false,
    };
  }

  if (runningEntries.length === 1) {
    return {
      sessionId: runningEntries[0][0],
      title: truncateTitle(primaryRunning?.title || "Supervisor", 16),
      subtitle: `${primaryRunning?.subtitle || "进行中"} · 已完成 ${completed}/${total}`,
      phase: primaryRunning?.phase ?? "thinking",
      chip,
      ...base,
      allComplete: false,
    };
  }

  const phaseHints = runningEntries
    .slice(0, 2)
    .map(([, entry]) => entry.subtitle || "进行中")
    .join(" · ");
  const more = runningEntries.length > 2 ? ` 等 ${active} 个` : "";

  return {
    sessionId: runningEntries[0]?.[0] ?? "aggregate",
    title: `${active} 个任务进行中`,
    subtitle:
      completed > 0
        ? `${phaseHints}${more} · 已完成 ${completed}/${total}`
        : `${phaseHints}${more} · 共 ${total} 个任务`,
    phase: primaryRunning?.phase ?? "thinking",
    chip,
    ...base,
    allComplete: false,
  };
}

async function publishLiveStatus(): Promise<void> {
  publishChain = publishChain.then(async () => {
    const native = await plugin();
    if (!native) return;

    const payload = buildPayload();
    if (!payload) {
      await native.endLiveStatus({ sessionId: "aggregate" }).catch(() => undefined);
      return;
    }
    await native.updateLiveStatus(payload);
  });
  await publishChain;
}

function applyTrackedState(options: {
  sessionId: string;
  title: string;
  subtitle: string;
  phase: LiveStatusPhase;
  state: TrackedState;
}): void {
  const existing = tracked.get(options.sessionId);
  if (options.state !== "done") {
    tracked.set(options.sessionId, {
      state: options.state,
      title: options.title,
      subtitle: options.subtitle,
      phase: options.phase,
    });
    return;
  }
  if (!existing) return;
  if (existing.state === "running" || existing.state === "waiting") {
    markRecentDone(options.sessionId, options.title || existing.title);
  }
  tracked.set(options.sessionId, {
    ...existing,
    title: options.title || existing.title,
    state: "done",
    subtitle: "已完成",
    phase: "idle",
  });
}

function applyTracked(options: {
  sessionId: string;
  title: string;
  subtitle: string;
  phase: LiveStatusPhase;
  running: boolean;
}): void {
  applyTrackedState({
    ...options,
    state: options.running ? (options.phase === "waiting" ? "waiting" : "running") : "done",
  });
}

export async function startLiveStatus(payload: LiveStatusPayload): Promise<void> {
  applyTracked({
    sessionId: payload.sessionId,
    title: payload.title,
    subtitle: payload.subtitle ?? "",
    phase: payload.phase ?? "thinking",
    running: true,
  });
  await publishLiveStatus();
}

export async function updateLiveStatus(payload: LiveStatusPayload): Promise<void> {
  applyTracked({
    sessionId: payload.sessionId,
    title: payload.title,
    subtitle: payload.subtitle ?? "",
    phase: payload.phase ?? "thinking",
    running: payload.phase !== "idle",
  });
  await publishLiveStatus();
}

/** Mark one session completed; keep showing Live Update when the whole wave is done. */
export async function endLiveStatus(sessionId: string): Promise<void> {
  applyTracked({
    sessionId,
    title: tracked.get(sessionId)?.title ?? "Supervisor",
    subtitle: "已完成",
    phase: "idle",
    running: false,
  });
  await publishLiveStatus();
}

export async function syncAgentLiveStatus(options: {
  sessionId: string;
  title: string;
  subtitle: string;
  phase: LiveStatusPhase;
  running: boolean;
  /** Session status for waiting/error mapping; falls back to running+phase. */
  status?: string | null;
}): Promise<void> {
  if (options.status === "error") {
    applyTrackedState({ ...options, state: "error" });
  } else {
    applyTracked(options);
  }
  await publishLiveStatus();
}

/** Keep aggregate counts in sync for sessions not currently open in ChatView. */
export function initLiveStatusSessionWatch(): void {
  if (!isNativeApp() || liveStatusWatchStarted) return;
  liveStatusWatchStarted = true;

  const sessionStore = useSessionStore();
  watch(
    () =>
      sessionStore.sessions
        .filter((session) => !session.isBuiltin)
        .map((session) => `${session.id}:${session.status}:${session.title ?? ""}`)
        .join("|"),
    () => {
      for (const session of sessionStore.sessions) {
        if (session.isBuiltin) continue;
        const state = stateForStatus(session.status);
        // Only sessions active in this wave join; stale done/error rows stay out.
        if (state !== "running" && state !== "waiting" && !tracked.has(session.id)) continue;
        applyTrackedState({
          sessionId: session.id,
          title: session.title?.trim() || "Supervisor",
          subtitle: subtitleForStatus(session.status),
          phase: phaseForStatus(session.status),
          state,
        });
      }
      void publishLiveStatus();
    },
  );
}

export async function isAndroidLiveUpdatesAvailable(): Promise<boolean> {
  const native = await plugin();
  if (!native) return false;
  const result = await native.isAndroidLiveUpdatesAvailable();
  return result.available;
}

/** @deprecated Use isAndroidLiveUpdatesAvailable */
export async function isOppoLiveUpdatesAvailable(): Promise<boolean> {
  return isAndroidLiveUpdatesAvailable();
}

export async function startBackgroundConnection(title: string, body: string): Promise<void> {
  const native = await plugin();
  if (!native) return;
  await native.startBackgroundConnection({ title, body });
}

export async function stopBackgroundConnection(): Promise<void> {
  const native = await plugin();
  if (!native) return;
  await native.stopBackgroundConnection();
}

export async function updateBackgroundConnection(title: string, body: string): Promise<void> {
  const native = await plugin();
  if (!native) return;
  await native.updateBackgroundConnection({ title, body });
}

export type { LiveStatusPhase, LiveStatusPayload };
