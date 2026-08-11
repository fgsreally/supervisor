import { Capacitor } from "@capacitor/core";
import { ref } from "vue";
import router from "@/router";
import { useSessionStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import { isNativeApp } from "@/composables/use-native-app";

interface ShareItem {
  uri: string;
  mimeType: string;
  name: string;
}

interface PendingSharePayload {
  items: ShareItem[];
}

/** Files waiting for the user to pick a target session. */
const stagingShareFiles = ref<File[]>([]);
/** Files committed to a session; ChatView consumes these via revision. */
const pendingShareFiles = ref<File[]>([]);
const pendingShareRevision = ref(0);
const pendingShareNeedsSession = ref(false);
const pendingShareHighlightSessionId = ref<string | null>(null);
let shareListenerRegistered = false;
let supervisorNative: typeof import("pi-supervisor-native-bridge").SupervisorNative | null = null;

async function plugin() {
  if (!isNativeApp()) return null;
  if (!Capacitor.isPluginAvailable("SupervisorNative")) return null;
  if (!supervisorNative) {
    const mod = await import("pi-supervisor-native-bridge");
    supervisorNative = mod.SupervisorNative;
  }
  return supervisorNative;
}

interface ShareNativePlugin {
  getPendingShare(): Promise<PendingSharePayload | null>;
  clearPendingShare(): Promise<void>;
  addListener(
    eventName: "shareReceived",
    listenerFunc: (payload: PendingSharePayload) => void,
  ): Promise<{ remove: () => void }>;
}

async function sharePlugin(): Promise<ShareNativePlugin | null> {
  const native = await plugin();
  return native as ShareNativePlugin | null;
}

async function shareItemToFile(item: ShareItem): Promise<File | null> {
  try {
    const url = Capacitor.convertFileSrc(item.uri);
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const mimeType = item.mimeType || blob.type || "image/jpeg";
    if (!mimeType.startsWith("image/")) return null;
    const name = item.name || "shared.jpg";
    return new File([blob], name, { type: mimeType });
  } catch {
    return null;
  }
}

async function openSessionPickerForShare(): Promise<void> {
  const sessionStore = useSessionStore();
  if (!sessionStore.sessions.length) {
    await sessionStore.fetchSessions().catch(() => undefined);
  }

  const available = sessionStore.sessions.filter((session) => !session.isBuiltin);
  if (!available.length) {
    stagingShareFiles.value = [];
    pendingShareNeedsSession.value = false;
    pendingShareHighlightSessionId.value = null;
    showUiMessage("请先创建会话再接收分享图片", "error");
    return;
  }

  const match = router.currentRoute.value.path.match(/^\/chat\/([^/]+)/);
  pendingShareHighlightSessionId.value = match?.[1] ?? null;
  pendingShareNeedsSession.value = true;
}

async function ingestPendingShare(payload?: PendingSharePayload | null): Promise<void> {
  const native = await sharePlugin();
  if (!native) return;

  let share = payload;
  if (!share?.items?.length) {
    share = (await native.getPendingShare()) as PendingSharePayload | null;
  }
  if (!share?.items?.length) return;

  const files: File[] = [];
  for (const item of share.items) {
    const file = await shareItemToFile(item);
    if (file) files.push(file);
  }

  await native.clearPendingShare().catch(() => undefined);
  if (!files.length) {
    showUiMessage("无法读取分享的图片", "error");
    return;
  }

  stagingShareFiles.value.push(...files);
  await openSessionPickerForShare();
}

export function takePendingShareFiles(): File[] {
  const files = [...pendingShareFiles.value];
  pendingShareFiles.value = [];
  return files;
}

export function usePendingShareRevision() {
  return pendingShareRevision;
}

export function usePendingShareNeedsSession() {
  return pendingShareNeedsSession;
}

export function usePendingShareHighlightSessionId() {
  return pendingShareHighlightSessionId;
}

export async function confirmPendingShareSession(sessionId: string): Promise<void> {
  if (!sessionId || !stagingShareFiles.value.length) {
    cancelPendingShareSession();
    return;
  }

  pendingShareNeedsSession.value = false;
  pendingShareHighlightSessionId.value = null;
  pendingShareFiles.value.push(...stagingShareFiles.value);
  stagingShareFiles.value = [];

  const targetPath = `/chat/${sessionId}`;
  if (router.currentRoute.value.path !== targetPath) {
    await router.push(targetPath);
  }
  pendingShareRevision.value += 1;
}

export function cancelPendingShareSession(): void {
  pendingShareNeedsSession.value = false;
  pendingShareHighlightSessionId.value = null;
  stagingShareFiles.value = [];
}

export async function initPendingShare(): Promise<void> {
  if (!isNativeApp() || shareListenerRegistered) return;
  const native = await sharePlugin();
  if (!native) return;

  shareListenerRegistered = true;
  await native.addListener("shareReceived", (payload: PendingSharePayload) => {
    void ingestPendingShare(payload);
  });
  await ingestPendingShare();
}

export async function attachPendingShareToInput(
  addImage: ((file: File) => void) | undefined,
): Promise<void> {
  if (!addImage) return;
  const files = takePendingShareFiles();
  for (const file of files) addImage(file);
}
