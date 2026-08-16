<template>
  <div class="chat-input-shell shrink-0">
    <div class="chat-input-hold-stage">
      <div
        v-if="holdRecording"
        class="hold-voice-hint"
        :class="{ 'hold-voice-hint--cancel': willCancel }"
        aria-live="polite"
      >
        {{ willCancel ? t("chat.input.releaseCancel") : t("chat.input.releaseSend") }}
      </div>
      <div
        ref="composerHoldZoneRef"
        class="chat-input-island relative"
        :class="{ 'chat-input-island--holding': holdRecording }"
        :style="{ height: `${panelHeight}px` }"
        @pointerdown="onHoldPointerDown"
        @pointermove="onHoldPointerMove"
        @pointerup="onHoldPointerUp"
        @pointercancel="onHoldPointerCancel"
      >
        <div
          v-if="holdRecording"
          class="hold-voice-button"
          :class="{ 'hold-voice-button--cancel': willCancel }"
        >
          <span class="hold-voice-button__bars" aria-hidden="true">
            <span
              v-for="(level, index) in voice.waveformBars.value"
              :key="index"
              class="hold-voice-button__bar"
              :style="{ height: `${Math.max(8, level * 2)}px` }"
            />
          </span>
        </div>
        <template v-else>
          <div v-if="emptyStateTitle" class="chat-input-empty-state">
            <div class="chat-input-empty-state__icon"><Bot class="h-5 w-5" /></div>
            <div class="chat-input-empty-state__copy">
              <strong>{{ emptyStateTitle }}</strong>
              <span v-if="emptyStateDescription">{{ emptyStateDescription }}</span>
            </div>
            <button v-if="emptyStateAction" type="button" @click="emit('empty-action')">
              {{ emptyStateAction }}
            </button>
          </div>
          <ResizeHandle orientation="horizontal" :label="t('chat.input.resize')" @start="startResize" />
          <ChatPendingImages :images="pendingImages" @remove="removePendingImage" />
          <div class="chat-input-editor-wrap flex-1 min-h-0 relative">
            <ChatComposer
              ref="composerRef"
              v-model="text"
              class="chat-input-editor flex-1 min-h-0"
              :editor-height="editorHeight"
              :workspace-files="workspaceFiles"
              :projects="projectOptions"
              :workspace-cwd="workspaceId"
              :current-project-id="currentProjectId"
              :skills="skills"
              :prompts="prompts"
              :commands="autocompleteCommands"
              :skill-trigger="skillTrigger"
              :disabled="disabled"
              :placeholder="composerPlaceholder"
              @send="emit('send', { text, images: pendingImages })"
              @paste-image="addPendingImage"
            />
          </div>
          <ChatInputToolbar
            :voice="voice"
            :disabled="disabled"
            :can-send="canSend"
            :interrupting="interrupting"
            :shadow-running="shadowRunning"
            :hold-recording="holdRecording"
            @action="onToolbarAction"
            @send="emit('send', { text, images: pendingImages })"
            @interrupt="emit('interrupt')"
          />
          <input
            ref="imageInputRef"
            type="file"
            class="sr-only"
            accept="image/*"
            multiple
            tabindex="-1"
            @change="onImageInputChange"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Bot } from "lucide-vue-next";
import * as api from "@/api";
import { useAgentStore, useSessionStore } from "@/store";
import { useResizableHeight } from "../../composables/use-resizable-height";
import { showUiMessage } from "../../composables/use-ui-message";
import { isNativeApp } from "../../composables/use-native-app";
import { pickChatImage } from "../../composables/use-native-camera";
import { useVoiceRecognition } from "../../composables/use-voice-recognition";
import type { ChatSendPayload, PendingChatImage } from "@/types/chat-compose";
import { useI18n } from "@/i18n";
import {
  promptsFromAgentResources,
  skillsFromAgentResources,
  type ProjectAutocompleteEntry,
  type PromptAutocompleteEntry,
  type SkillAutocompleteEntry,
  type WorkspaceFileEntry,
} from "../../utils/chat-autocomplete";
import ChatComposer from "./ChatComposer.vue";
import ChatInputToolbar, { type ChatToolbarAction } from "./ChatInputToolbar.vue";
import ChatPendingImages from "./ChatPendingImages.vue";
import ResizeHandle from "../base/ResizeHandle.vue";

const TOOLBAR_HEIGHT = 40;
const HOLD_LONG_PRESS_MS = 300;

const props = defineProps<{
  modelValue: string;
  sessionId?: string;
  workspaceId: string;
  agentId?: string;
  disabled?: boolean;
  interrupting?: boolean;
  shadowRunning?: boolean;
  placeholder?: string;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  emptyStateAction?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  send: [payload: ChatSendPayload];
  interrupt: [];
  slash: [name: string];
  "empty-action": [];
  btw: [];
}>();
const { t } = useI18n();

const agentStore = useAgentStore();
const sessionStore = useSessionStore();
const workspaceFiles = ref<WorkspaceFileEntry[]>([]);
const skills = ref<SkillAutocompleteEntry[]>([]);
const prompts = ref<PromptAutocompleteEntry[]>([]);
const customCommands = ref<api.SlashCommandInfo[]>([]);
const imageInputRef = ref<HTMLInputElement | null>(null);
const projectOptions = computed<ProjectAutocompleteEntry[]>(() =>
  sessionStore.projects.map((p) => ({ id: p.id, name: p.name, cwd: p.cwd })),
);
const currentProjectId = computed(() => {
  if (props.sessionId) {
    const session = sessionStore.getSessionById(props.sessionId);
    if (session?.projectId != null) return String(session.projectId);
  }
  return sessionStore.currentSession?.projectId != null
    ? String(sessionStore.currentSession.projectId)
    : null;
});
const autocompleteCommands = computed(() =>
  customCommands.value.map((command) => ({
    name: command.name.replace(/^\//, ""),
    description: command.description,
    source:
      command.source === "mcp" || command.name.toLowerCase().startsWith("mcp")
        ? ("mcp" as const)
        : ("custom" as const),
  })),
);
const pendingImages = ref<PendingChatImage[]>([]);
let commandRefreshInFlight: Promise<void> | null = null;
let lastCommandRefresh = 0;
let commandRetryTimer: ReturnType<typeof setTimeout> | null = null;

const isExternalAgent = computed(() => {
  if (!props.agentId) return false;
  return agentStore.getAgentById(props.agentId)?.backendType !== "native";
});
const skillTrigger = computed<"slash">(() => "slash");

const text = computed({
  get: () => props.modelValue,
  set: (value: string) => emit("update:modelValue", value),
});

const canSend = computed(
  () => (!!text.value.trim() || pendingImages.value.length > 0) && !props.disabled,
);

const isNarrow = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
const isMobile = ref(isNarrow);
const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
const { height: panelHeight, startResize } = useResizableHeight({
  // PC 默认约占视口 1/5；移动端保持紧凑高度
  defaultHeight: isNarrow ? 80 : Math.round(viewportHeight * 0.2),
  minHeight: isNarrow ? 72 : 80,
  maxHeight: isNarrow ? 320 : Math.max(320, Math.round(viewportHeight * 0.5)),
  storageKey: "pi-supervisor-chat-input-height-v3",
});

const editorHeight = computed(() => Math.max(40, panelHeight.value - TOOLBAR_HEIGHT));

const composerRef = ref<InstanceType<typeof ChatComposer> | null>(null);
const composerHoldZoneRef = ref<HTMLElement | null>(null);
const voiceBaseText = ref("");
const holdRecording = ref(false);
const willCancel = ref(false);
const toolbarVoiceActive = ref(false);

let holdPointerId: number | null = null;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let mobileMediaQuery: MediaQueryList | null = null;
let onMobileMediaChange: (() => void) | null = null;

const composerPlaceholder = computed(() => {
  if (isMobile.value) return t("chat.input.holdToSpeak");
  return props.placeholder ?? t("chat.input.placeholder");
});

const voice = useVoiceRecognition(
  {
    onStart: () => {
      if (!holdRecording.value) {
        toolbarVoiceActive.value = true;
        voiceBaseText.value = text.value;
        void nextTick(() => composerRef.value?.focus());
      }
    },
    onEnd: () => {
      if (holdRecording.value) return;
      toolbarVoiceActive.value = false;
      voiceBaseText.value = text.value;
    },
    onPreview: (preview) => {
      if (holdRecording.value) return;
      applyVoicePreview(preview);
    },
    onTranscript: (transcript) => {
      if (holdRecording.value) return;
      appendTranscript(transcript);
    },
    onError: (message) => {
      if (holdRecording.value) {
        holdRecording.value = false;
        willCancel.value = false;
        text.value = voiceBaseText.value;
      } else {
        toolbarVoiceActive.value = false;
        voiceBaseText.value = text.value;
      }
      showUiMessage(message, "error");
    },
  },
  {
    // 移动端长按录音按钮需要密集音波；工具栏小图标会抽样展示
    barCount: 40,
    idleHeight: 6,
    minHeight: 6,
    maxHeight: 22,
  },
);

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function releaseHoldPointerCapture() {
  if (holdPointerId == null || !composerHoldZoneRef.value) return;
  try {
    composerHoldZoneRef.value.releasePointerCapture(holdPointerId);
  } catch {
    // pointer may already be released
  }
}

function isInsideHoldZone(clientX: number, clientY: number): boolean {
  const rect = composerHoldZoneRef.value?.getBoundingClientRect();
  if (!rect) return true;
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  );
}

function onHoldPointerDown(event: PointerEvent) {
  if (!isMobile.value || props.disabled || holdRecording.value || voice.recording.value) return;
  if (event.pointerType === "mouse") return;
  const target = event.target as Element | null;
  if (
    target?.closest(
      ".chat-input-toolbar, .chat-input-empty-state, .resize-handle, .pending-images, input, button",
    )
  ) {
    return;
  }

  event.preventDefault();
  holdPointerId = event.pointerId;
  composerHoldZoneRef.value?.setPointerCapture(event.pointerId);

  clearLongPressTimer();
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    if (holdPointerId !== event.pointerId) return;
    composerRef.value?.blur();
    voiceBaseText.value = text.value;
    holdRecording.value = true;
    willCancel.value = false;
    void voice.start();
  }, HOLD_LONG_PRESS_MS);
}

function onHoldPointerMove(event: PointerEvent) {
  if (holdPointerId !== event.pointerId) return;
  if (!holdRecording.value) return;
  willCancel.value = !isInsideHoldZone(event.clientX, event.clientY);
}

async function finishHoldAndSend() {
  const transcript = await voice.stop();
  holdRecording.value = false;
  willCancel.value = false;
  releaseHoldPointerCapture();
  holdPointerId = null;

  const chunk = transcript.trim();
  if (!chunk) {
    text.value = voiceBaseText.value;
    return;
  }
  const sep = voiceBaseText.value && !/\s$/.test(voiceBaseText.value) ? " " : "";
  const finalText = voiceBaseText.value + sep + chunk;
  emit("send", { text: finalText, images: pendingImages.value });
}

function cancelHoldRecording() {
  voice.abort();
  holdRecording.value = false;
  willCancel.value = false;
  text.value = voiceBaseText.value;
  releaseHoldPointerCapture();
  holdPointerId = null;
}

function onHoldPointerUp(event: PointerEvent) {
  if (holdPointerId !== event.pointerId) return;

  clearLongPressTimer();

  if (holdRecording.value) {
    if (willCancel.value) {
      cancelHoldRecording();
    } else {
      void finishHoldAndSend();
    }
    return;
  }

  releaseHoldPointerCapture();
  holdPointerId = null;
  composerRef.value?.focus();
}

function onHoldPointerCancel(event: PointerEvent) {
  if (holdPointerId !== event.pointerId) return;
  clearLongPressTimer();
  if (holdRecording.value) {
    cancelHoldRecording();
    return;
  }
  releaseHoldPointerCapture();
  holdPointerId = null;
}

onMounted(() => {
  if (typeof window === "undefined") return;
  mobileMediaQuery = window.matchMedia("(max-width: 767px)");
  onMobileMediaChange = () => {
    isMobile.value = mobileMediaQuery?.matches ?? false;
  };
  onMobileMediaChange();
  mobileMediaQuery.addEventListener("change", onMobileMediaChange);
});

async function loadAutocompleteData() {
  const cwd = props.workspaceId.trim();
  if (cwd) {
    try {
      workspaceFiles.value = await api.listWorkspaceFiles(cwd);
    } catch {
      workspaceFiles.value = [];
    }
  } else {
    workspaceFiles.value = [];
  }

  if (sessionStore.projects.length === 0) {
    void sessionStore.fetchProjects();
  }

  if (props.agentId && !isExternalAgent.value) {
    try {
      await agentStore.fetchAgentResources(props.agentId, cwd || undefined);
      const res = agentStore.agentResources[props.agentId];
      skills.value = skillsFromAgentResources(props.agentId, res);
      prompts.value = promptsFromAgentResources(props.agentId, res);
      if (props.sessionId) await refreshSessionCommands(true);
    } catch {
      skills.value = [];
      prompts.value = [];
    }
  } else {
    skills.value = [];
    if (props.sessionId) await refreshSessionCommands(true);
  }
}

async function refreshSessionCommands(force = false) {
  if (!props.sessionId) return;
  const sessionId = props.sessionId;
  if (!force && Date.now() - lastCommandRefresh < 1000) return;
  if (commandRefreshInFlight) return commandRefreshInFlight;
  commandRefreshInFlight = (async () => {
    try {
      const commands = await api.getSessionCommands(sessionId);
      const commandSkills = commands
        .filter((command) => command.source === "skill")
        .map((command) => ({ name: command.name, description: command.description }));
      const commandPrompts = commands
        .filter((command) => command.source === "prompt")
        .map((command) => ({
          name: command.name.replace(/^\//, ""),
          description: [
            command.description,
            command.arguments?.type === "text" ? command.arguments.placeholder : undefined,
          ]
            .filter(Boolean)
            .join(" · "),
        }));
      skills.value = [
        ...skills.value.filter((item) => !commandSkills.some((c) => c.name === item.name)),
        ...commandSkills,
      ];
      prompts.value = [
        ...prompts.value.filter((item) => !commandPrompts.some((c) => c.name === item.name)),
        ...commandPrompts,
      ];
      customCommands.value = commands.filter((command) => {
        const source = command.source ?? "custom";
        return source !== "skill" && source !== "prompt";
      });
      lastCommandRefresh = Date.now();
      if (commands.length === 0 && /(^|\s)\/[^\s]*$/.test(props.modelValue)) {
        if (commandRetryTimer) clearTimeout(commandRetryTimer);
        commandRetryTimer = setTimeout(() => void refreshSessionCommands(true), 750);
      }
    } catch (error) {
      if (/(^|\s)\/[^\s]*$/.test(props.modelValue)) {
        showUiMessage(error instanceof Error ? error.message : t("chat.input.commandsLoadFailed"), "error");
      }
    } finally {
      commandRefreshInFlight = null;
    }
  })();
  return commandRefreshInFlight;
}

watch(
  () => [props.sessionId, props.workspaceId, props.agentId] as const,
  () => {
    void loadAutocompleteData();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearLongPressTimer();
  if (mobileMediaQuery && onMobileMediaChange) {
    mobileMediaQuery.removeEventListener("change", onMobileMediaChange);
  }
  if (commandRetryTimer) clearTimeout(commandRetryTimer);
});

watch(
  () => props.modelValue,
  (value) => {
    if (/(^|\s)\/[^\s]*$/.test(value)) {
      void refreshSessionCommands(true);
    }
  },
);

function onToolbarAction(action: ChatToolbarAction) {
  switch (action) {
    case "attach":
      composerRef.value?.insertTrigger("@");
      break;
    case "skill":
      composerRef.value?.insertTrigger("/");
      break;
    case "emoji":
      composerRef.value?.focus();
      break;
    case "upload-image":
      if (isNativeApp()) {
        void pickChatImage()
          .then((file) => {
            if (file) addPendingImage(file);
          })
          .catch((error: unknown) => {
            showUiMessage(error instanceof Error ? error.message : t("chat.input.cameraFailed"), "error");
          });
      } else {
        imageInputRef.value?.click();
      }
      break;
    case "btw":
      emit("btw");
      break;
  }
}

function applyVoicePreview(preview: string) {
  const chunk = preview.trim();
  if (!chunk) {
    text.value = voiceBaseText.value;
    return;
  }
  const sep = voiceBaseText.value && !/\s$/.test(voiceBaseText.value) ? " " : "";
  text.value = voiceBaseText.value + sep + chunk;
}

function appendTranscript(transcript: string) {
  applyVoicePreview(transcript);
  void nextTick(() => composerRef.value?.focus());
}

function addPendingImage(file: File) {
  if (!file.type.startsWith("image/")) return;
  if (!props.sessionId) {
    showUiMessage(t("chat.input.openSessionFirst"), "error");
    return;
  }
  const sessionId = props.sessionId;
  void (async () => {
    try {
      const uploaded = await api.uploadSessionMedia(sessionId, file);
      const index = pendingImages.value.length + 1;
      const label = `[Image #${index}]`;
      const previewUrl = URL.createObjectURL(file);
      pendingImages.value.push({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: uploaded.name || file.name || label,
        mimeType: uploaded.mimeType,
        previewUrl,
        mediaId: uploaded.mediaId,
      });
      const separator = text.value && !/\s$/.test(text.value) ? " " : "";
      text.value += `${separator}${label}`;
      void nextTick(() => composerRef.value?.focus());
    } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("chat.input.uploadFailed"), "error");
    }
  })();
}

function onImageInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  for (const file of files) addPendingImage(file);
  input.value = "";
}

function removePendingImage(id: string) {
  const item = pendingImages.value.find((img) => img.id === id);
  if (item?.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(item.previewUrl);
  }
  pendingImages.value = pendingImages.value.filter((img) => img.id !== id);
}

function clearPendingImages() {
  for (const img of pendingImages.value) {
    if (img.previewUrl.startsWith("blob:")) URL.revokeObjectURL(img.previewUrl);
  }
  pendingImages.value = [];
}

function focus() {
  composerRef.value?.focus();
}

function clearAfterSend() {
  clearPendingImages();
}

defineExpose({ focus, clearAfterSend, addPendingImage });
</script>

<style scoped>
.chat-input-shell {
  padding: 0 8px 8px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  background: var(--app-chat-bg);
}

.chat-input-hold-stage {
  position: relative;
}

.chat-input-island {
  display: flex;
  flex-direction: column;
  overflow: visible;
  background: var(--app-chat-input-island-bg, var(--app-chat-bg));
  border: 1px solid var(--app-chat-input-island-border);
  border-radius: 10px;
  touch-action: manipulation;
}

.chat-input-island--holding {
  overflow: hidden;
  border-color: transparent;
  background: transparent;
  touch-action: none;
}

.chat-input-editor {
  min-height: 40px;
  min-width: 0;
}

.chat-input-editor-wrap {
  touch-action: manipulation;
}

.hold-voice-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  z-index: 5;
  margin: 0 0 10px;
  text-align: center;
  font-size: 12px;
  line-height: 1.2;
  color: var(--app-text-secondary, #888);
  user-select: none;
  pointer-events: none;
}

.hold-voice-hint--cancel {
  color: #fa5151;
}

.hold-voice-button {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100%;
  border-radius: 10px;
  background: var(--app-accent, #07c160);
  color: #fff;
  user-select: none;
  touch-action: none;
  transition: background-color 0.12s ease;
}

.hold-voice-button--cancel {
  background: #fa5151;
}

.hold-voice-button__bars {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: min(82%, 340px);
  height: 36px;
}

.hold-voice-button__bar {
  flex: 1 1 0;
  min-width: 1.5px;
  min-height: 8px;
  border-radius: 999px;
  background: currentColor;
  will-change: height;
}

.chat-input-empty-state {
  position: absolute;
  z-index: 30;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 18px;
  border-radius: inherit;
  background: color-mix(
    in srgb,
    var(--app-chat-input-island-bg, var(--app-chat-bg)) 88%,
    transparent
  );
  backdrop-filter: blur(5px);
}

.chat-input-empty-state__icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: none;
  place-items: center;
  border-radius: 12px;
  color: var(--app-text-muted);
  background: var(--app-hover);
}

.chat-input-empty-state__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.chat-input-empty-state__copy strong {
  color: var(--app-text-primary);
  font-size: 13px;
}

.chat-input-empty-state button {
  flex: none;
  padding: 6px 10px;
  border-radius: 7px;
  color: white;
  background: var(--app-accent, #07c160);
  font-size: 12px;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
}

.chat-input-empty-state button:hover,
.chat-input-empty-state button:focus-visible {
  background: #06ad56;
  outline: none;
}

.chat-input-empty-state button:active {
  transform: scale(0.96);
}

@media (max-width: 767px) {
  .chat-input-shell {
    padding: 0 5px calc(5px + env(safe-area-inset-bottom));
  }

  .hold-voice-hint {
    margin-bottom: 12px;
    font-size: 13px;
  }

  .hold-voice-button__bars {
    width: min(88%, 380px);
    height: 42px;
    gap: 1.5px;
  }

  .hold-voice-button__bar {
    min-width: 1px;
  }

  .chat-input-island:not(:has(.chat-input-empty-state)) {
    height: 92px !important;
  }

  .chat-input-island :deep(.resize-handle) {
    display: none;
  }

  .chat-input-editor {
    max-height: 52px;
  }

  .chat-input-editor :deep(.cm-editor) {
    height: 52px !important;
    max-height: 52px;
  }

  .chat-input-island:has(.chat-input-empty-state) {
    height: 72px !important;
  }

  .chat-input-empty-state {
    justify-content: flex-start;
    gap: 10px;
    padding: 10px 12px;
    backdrop-filter: none;
  }

  .chat-input-empty-state__icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }

  .chat-input-empty-state__copy {
    flex: 1;
  }

  .chat-input-empty-state__copy span {
    display: none;
  }

  .chat-input-empty-state button {
    padding: 8px 12px;
    font-size: 13px;
  }
}
</style>
