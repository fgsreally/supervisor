import { watch } from "vue";

import type { Session, SessionStatus } from "@/api";
import * as api from "@/api";
import { useSessionStore } from "@/store";
import { viewPreferences } from "@/utils/view-preferences";
import {
  isCurrentlyOpenVisibleSession,
  bindNotificationNavigation,
} from "@/utils/notification-navigate";
import { notifyAskUserInput, notifyMessageComplete, notifySessionError } from "./use-notifications";

export type SessionNotifyKind = "complete" | "error" | "ask";

const ACTIVE_STATUSES = new Set<SessionStatus>(["running", "blocked", "initializing"]);

let watchStarted = false;
let stopWatch: (() => void) | null = null;
const lastStatus = new Map<string, SessionStatus>();
const subscriptions = new Map<string, () => void>();

export function isActiveSessionStatus(status: string | undefined | null): boolean {
  return status === "running" || status === "blocked" || status === "initializing";
}

/** Decide which notification to fire for a status transition. First sighting is not a transition. */
export function notifyKindForStatusChange(
  previous: string | undefined,
  next: string,
): SessionNotifyKind | null {
  if (!next || previous === undefined || previous === next) return null;
  const wasActive = ACTIVE_STATUSES.has(previous as SessionStatus);
  if (wasActive && next === "idle") return "complete";
  if (next === "error") return "error";
  if (next === "blocked") return "ask";
  return null;
}

function sessionDisplayName(session: Session): string {
  const title = session.title?.trim();
  if (title) return title;
  const metaName = session.meta?.name;
  return typeof metaName === "string" && metaName.trim() ? metaName.trim() : "会话";
}

function isMuted(session: Session): boolean {
  return !!session.muted || viewPreferences.mutedSessionIds.includes(session.id);
}

function applyRemoteStatus(sessionId: string, status: SessionStatus): void {
  const sessionStore = useSessionStore();
  const session = sessionStore.sessions.find((item) => item.id === sessionId);
  if (!session || session.status === status) return;
  session.status = status;
}

function subscribeActiveSession(sessionId: string): void {
  if (subscriptions.has(sessionId)) return;
  const unsubscribe = api.subscribeSessionEvents(sessionId, (payload) => {
    const event = payload.event;
    if (!event) return;
    if (event.type === "session_status") {
      applyRemoteStatus(sessionId, event.status);
      return;
    }
    if (event.type === "agent_end") {
      void useSessionStore()
        .fetchSession(sessionId)
        .catch(() => undefined);
    }
  });
  subscriptions.set(sessionId, unsubscribe);
}

function syncActiveSubscriptions(sessions: Session[]): void {
  const wanted = new Set(
    sessions
      .filter((session) => !session.isBuiltin && isActiveSessionStatus(session.status))
      .map((session) => session.id),
  );
  for (const [id, unsubscribe] of subscriptions) {
    if (wanted.has(id)) continue;
    unsubscribe();
    subscriptions.delete(id);
  }
  for (const id of wanted) {
    subscribeActiveSession(id);
  }
}

function dispatchForSession(session: Session, kind: SessionNotifyKind): void {
  if (session.isBuiltin || isMuted(session)) return;
  if (isCurrentlyOpenVisibleSession(session.id)) return;
  const sessionName = sessionDisplayName(session);
  if (kind === "complete") {
    notifyMessageComplete({
      sessionId: session.id,
      sessionName,
      muted: false,
      preview: session.lastMessagePreview,
    });
    return;
  }
  if (kind === "error") {
    notifySessionError({
      sessionId: session.id,
      sessionName,
      muted: false,
      detail: session.errorMsg ?? undefined,
    });
    return;
  }
  notifyAskUserInput({
    sessionId: session.id,
    sessionName,
    muted: false,
  });
}

function processSessions(sessions: Session[]): void {
  const seen = new Set<string>();
  for (const session of sessions) {
    seen.add(session.id);
    const previous = lastStatus.get(session.id);
    lastStatus.set(session.id, session.status);
    if (session.isBuiltin) continue;
    const kind = notifyKindForStatusChange(previous, session.status);
    if (!kind) continue;
    dispatchForSession(session, kind);
  }
  for (const id of lastStatus.keys()) {
    if (seen.has(id)) continue;
    lastStatus.delete(id);
  }
  syncActiveSubscriptions(sessions);
}

export function initSessionNotifyWatch(): void {
  if (watchStarted) return;
  watchStarted = true;
  bindNotificationNavigation();
  const sessionStore = useSessionStore();
  for (const session of sessionStore.sessions) {
    lastStatus.set(session.id, session.status);
  }
  syncActiveSubscriptions(sessionStore.sessions);
  stopWatch = watch(
    () => sessionStore.sessions.map((session) => `${session.id}:${session.status}`).join("|"),
    () => {
      processSessions(sessionStore.sessions);
    },
  );
}

/** Test-only: drop singleton watchers/subscriptions. */
export function resetSessionNotifyWatchForTests(): void {
  stopWatch?.();
  stopWatch = null;
  watchStarted = false;
  lastStatus.clear();
  for (const unsubscribe of subscriptions.values()) {
    unsubscribe();
  }
  subscriptions.clear();
}
