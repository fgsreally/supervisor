/** Client-only chat UI preferences (not persisted to supervisor DB). */

const STORAGE_KEY = "pi-supervisor-chat-prefs";

interface SessionChatPrefs {
  showThinking?: boolean;
}

interface ChatPrefsStore {
  sessions: Record<string, SessionChatPrefs>;
}

function readStore(): ChatPrefsStore {
  if (typeof localStorage === "undefined") return { sessions: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sessions: {} };
    const parsed = JSON.parse(raw) as ChatPrefsStore;
    if (!parsed || typeof parsed !== "object" || !parsed.sessions) return { sessions: {} };
    return parsed;
  } catch {
    return { sessions: {} };
  }
}

function writeStore(store: ChatPrefsStore): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getShowThinking(sessionId: string): boolean {
  return !!readStore().sessions[sessionId]?.showThinking;
}

export function setShowThinking(sessionId: string, value: boolean): void {
  const store = readStore();
  store.sessions[sessionId] = { ...store.sessions[sessionId], showThinking: value };
  writeStore(store);
}
