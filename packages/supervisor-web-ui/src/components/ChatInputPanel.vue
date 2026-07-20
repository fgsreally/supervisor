<template>
  <div class="chat-input-shell shrink-0">
    <div class="chat-input-island relative" :style="{ height: `${panelHeight}px` }">
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
        :skill-trigger="skillTrigger"
        :disabled="disabled"
        :placeholder="placeholder"
        @send="emit('send', { text, images: pendingImages })"
        @paste-image="addPendingImage"
      />
      <ChatInputToolbar
        :disabled="disabled"
        :can-send="canSend"
        :custom-commands="customCommands"
        @action="onToolbarAction"
        @slash="onCustomSlash"
        @send="emit('send', { text, images: pendingImages })"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import * as api from "@/api";
import { useAgentStore } from "@/store";
import { useResizableHeight } from "../composables/use-resizable-height";
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
  placeholder?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  send: [payload: ChatSendPayload];
  slash: [name: string];
}>();

const agentStore = useAgentStore();
const workspaceFiles = ref<WorkspaceFileEntry[]>([]);
const skills = ref<SkillAutocompleteEntry[]>([]);
const prompts = ref<PromptAutocompleteEntry[]>([]);
const customCommands = ref<api.SlashCommandInfo[]>([]);
const pendingImages = ref<PendingChatImage[]>([]);
let commandRefreshInFlight: Promise<void> | null = null;
let lastCommandRefresh = 0;
let commandRetryTimer: ReturnType<typeof setTimeout> | null = null;

const isExternalAgent = computed(() => {
  if (!props.agentId) return false;
  return agentStore.getAgentById(props.agentId)?.backendType !== "native";
});
const skillTrigger = computed<"slash" | "dollar">(() =>
  props.agentId && agentStore.getAgentById(props.agentId)?.backendType === "codex"
    ? "dollar"
    : "slash",
);

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
      customCommands.value = commands.filter((command) => command.source === "custom");
      lastCommandRefresh = Date.now();
      if (commands.length === 0 && /(^|\s)\/[^\s]*$/.test(props.modelValue)) {
        if (commandRetryTimer) clearTimeout(commandRetryTimer);
        commandRetryTimer = setTimeout(() => void refreshSessionCommands(true), 750);
      }
    } catch {
      prompts.value = [];
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
    if (isExternalAgent.value && /(^|\s)\/[^\s]*$/.test(value)) {
      void refreshSessionCommands();
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
    case "screenshot":
    case "voice":
      composerRef.value?.focus();
      break;
  }
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
</style>
