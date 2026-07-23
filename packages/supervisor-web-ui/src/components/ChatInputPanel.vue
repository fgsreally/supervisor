<template>
  <div class="chat-input-shell shrink-0">
    <div class="chat-input-island relative" :style="{ height: `${panelHeight}px` }">
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
      <ResizeHandle orientation="horizontal" label="调整输入区高度" @start="startResize" />
      <ChatPendingImages :images="pendingImages" @remove="removePendingImage" />
      <ChatComposer
        ref="composerRef"
        v-model="text"
        class="chat-input-editor flex-1 min-h-0"
        :editor-height="editorHeight"
        :workspace-files="workspaceFiles"
        :skills="skills"
        :prompts="prompts"
        :commands="autocompleteCommands"
        :skill-trigger="skillTrigger"
        :disabled="disabled"
        :placeholder="placeholder"
        @send="emit('send', { text, images: pendingImages })"
        @paste-image="addPendingImage"
      />
      <ChatInputToolbar
        :disabled="disabled"
        :can-send="canSend"
        :interrupting="interrupting"
        :custom-commands="customCommands"
        @action="onToolbarAction"
        @slash="onCustomSlash"
        @send="emit('send', { text, images: pendingImages })"
        @interrupt="emit('interrupt')"
        @transcript="appendTranscript"
        @voice-error="onVoiceError"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Bot } from "lucide-vue-next";
import * as api from "@/api";
import { useAgentStore } from "@/store";
import { useResizableHeight } from "../composables/use-resizable-height";
import { showUiMessage } from "../composables/use-ui-message";
import type { ChatSendPayload, PendingChatImage } from "@/types/chat-compose";
import {
  promptsFromAgentResources,
  skillsFromAgentResources,
  type PromptAutocompleteEntry,
  type SkillAutocompleteEntry,
  type WorkspaceFileEntry,
} from "../utils/chat-autocomplete";
import ChatComposer from "./ChatComposer.vue";
import ChatInputToolbar, { type ChatToolbarAction } from "./ChatInputToolbar.vue";
import ChatPendingImages from "./ChatPendingImages.vue";
import ResizeHandle from "./ResizeHandle.vue";

const TOOLBAR_HEIGHT = 40;

const props = defineProps<{
  modelValue: string;
  sessionId?: string;
  workspaceId: string;
  agentId?: string;
  disabled?: boolean;
  interrupting?: boolean;
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

const agentStore = useAgentStore();
const workspaceFiles = ref<WorkspaceFileEntry[]>([]);
const skills = ref<SkillAutocompleteEntry[]>([]);
const prompts = ref<PromptAutocompleteEntry[]>([]);
const customCommands = ref<api.SlashCommandInfo[]>([]);
const imageInputRef = ref<HTMLInputElement | null>(null);
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

const { height: panelHeight, startResize } = useResizableHeight({
  defaultHeight: 128,
  minHeight: 96,
  maxHeight: 320,
  storageKey: "pi-example-chat-input-height",
});

const editorHeight = computed(() => Math.max(40, panelHeight.value - TOOLBAR_HEIGHT));

const composerRef = ref<InstanceType<typeof ChatComposer> | null>(null);

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
          description: command.description,
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
        showUiMessage(
          error instanceof Error ? error.message : "斜杠命令列表加载失败",
          "error",
        );
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
      imageInputRef.value?.click();
      break;
    case "btw":
      emit("btw");
      break;
  }
}

function appendTranscript(transcript: string) {
  const separator = text.value && !/\s$/.test(text.value) ? " " : "";
  text.value += `${separator}${transcript}`;
  void nextTick(() => composerRef.value?.focus());
}

function onVoiceError(message: string) {
  showUiMessage(message, "error");
}

function onCustomSlash(name: string) {
  const command = customCommands.value.find((item) => item.name === name);
  if (!command) return;
  if (command.arguments?.type === "none") {
    emit("slash", name);
    return;
  }
  text.value = `/${name} `;
  void nextTick(() => composerRef.value?.focus());
}

function addPendingImage(file: File) {
  if (!file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result;
    if (typeof result !== "string") return;
    const comma = result.indexOf(",");
    const data = comma >= 0 ? result.slice(comma + 1) : result;
    pendingImages.value.push({
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name || "image.png",
      mimeType: file.type,
      previewUrl: result,
      data,
    });
  };
  reader.readAsDataURL(file);
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

defineExpose({ focus, clearAfterSend });
</script>

<style scoped>
.chat-input-shell {
  padding: 0 8px 8px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  background: var(--app-chat-bg);
}

.chat-input-island {
  display: flex;
  flex-direction: column;
  overflow: visible;
  background: var(--app-chat-bg);
  border: 1px solid var(--app-chat-input-island-border);
  border-radius: 10px;
}

.chat-input-editor {
  min-height: 40px;
  min-width: 0;
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
