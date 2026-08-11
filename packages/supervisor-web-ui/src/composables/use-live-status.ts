import { watch } from "vue";
import type { LiveStatusPayload, LiveStatusPhase } from "pi-supervisor-native-bridge";

import { useSessionStore } from "@/store";
import { isNativeApp } from "./use-native-app";

let supervisorNative: typeof import("pi-supervisor-native-bridge").SupervisorNative | null = null;

type TrackedSession = {
  running: boolean;
  title: string;
  subtitle: string;
  phase: LiveStatusPhase;
};

/** Sessions that became active during this app activity wave (running + completed). */
const tracked = new Map<string, TrackedSession>();
let liveStatusWatchStarted = false;
let publishChain: Promise<void> = Promise.resolve();

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

function phaseForStatus(status: string | undefined | null, streaming = false): LiveStatusPhase {
  if (status === "blocked") return "waiting";
  if (streaming) return "thinking";
  if (status === "running") return "thinking";
  if (status === "initializing") return "connecting";
  return "idle";
}

function subtitleForStatus(status: string | undefined | null, streaming = false): string {
  if (status === "blocked") return "等待你确认";
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
  let active = 0;
  for (const entry of tracked.values()) {
    if (entry.running) active += 1;
  }
  return { active, total: tracked.size, completed: tracked.size - active };
}

/** Build chip text within ~7 characters for the status-bar Live Update chip. */
function buildChip(active: number, total: number, allComplete: boolean): string {
  if (allComplete) return "完成";
  if (total <= 0) return "进行中";
  const ratio = `${active}/${total}`;
  return ratio.length <= 7 ? ratio : `${active}进行`;
}

function buildPayload(): LiveStatusPayload | null {
  const { active, total, completed } = counts();
  if (total === 0) return null;

  const allComplete = active === 0;
  const entries = [...tracked.entries()];
  const runningEntries = entries.filter(([, entry]) => entry.running);
  const completedEntries = entries.filter(([, entry]) => !entry.running);
  const primaryRunning = runningEntries[0]?.[1];
  const primaryCompleted = completedEntries[0]?.[1];
  const chip = buildChip(active, total, allComplete);

  if (allComplete) {
    const only = completedEntries.length === 1 ? primaryCompleted : null;
    return {
      sessionId: completedEntries[0]?.[0] ?? "aggregate",
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

  if (runningEntries.length === 1 && completed === 0) {
    return {
      sessionId: runningEntries[0][0],
      title: truncateTitle(primaryRunning?.title || "Supervisor", 16),
      subtitle: `${primaryRunning?.subtitle || "进行中"} · 共 1 个任务`,
      phase: primaryRunning?.phase ?? "thinking",
      chip,
      activeCount: active,
      completedCount: 0,
      totalCount: total,
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
      activeCount: active,
      completedCount: completed,
      totalCount: total,
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
    activeCount: active,
    completedCount: completed,
    totalCount: total,
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

function applyTracked(options: {
  sessionId: string;
  title: string;
  subtitle: string;
  phase: LiveStatusPhase;
  running: boolean;
}): void {
  const existing = tracked.get(options.sessionId);
  if (options.running) {
    tracked.set(options.sessionId, {
      running: true,
      title: options.title,
      subtitle: options.subtitle,
      phase: options.phase,
    });
    return;
  }
  if (!existing) return;
  tracked.set(options.sessionId, {
    ...existing,
    title: options.title || existing.title,
    running: false,
    subtitle: "已完成",
    phase: "idle",
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
}): Promise<void> {
  applyTracked(options);
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
        const running = isActiveStatus(session.status);
        if (!running && !tracked.has(session.id)) continue;
        applyTracked({
          sessionId: session.id,
          title: session.title?.trim() || "Supervisor",
          subtitle: subtitleForStatus(session.status),
          phase: phaseForStatus(session.status),
          running,
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
