<template>
  <div class="chat-input-shell shrink-0">
    <div class="chat-input-island relative" :style="{ height: `${panelHeight}px` }">
      <ResizeHandle orientation="horizontal" label="调整输入区高度" @start="startResize" />
      <ChatComposer
        ref="composerRef"
        v-model="text"
        class="chat-input-editor flex-1 min-h-0"
        :editor-height="editorHeight"
        :workspace-id="workspaceId"
        :agent-id="agentId"
        :disabled="disabled"
        @send="emit('send')"
      />
      <ChatInputToolbar
        :disabled="disabled"
        :can-send="!!text.trim() && !disabled"
        @action="onToolbarAction"
        @send="emit('send')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useResizableHeight } from "../composables/use-resizable-height";
import ChatComposer from "./ChatComposer.vue";
import ChatInputToolbar, { type ChatToolbarAction } from "./ChatInputToolbar.vue";
import ResizeHandle from "./ResizeHandle.vue";

const TOOLBAR_HEIGHT = 40;

const props = defineProps<{
  modelValue: string;
  workspaceId: string;
  agentId?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  send: [];
}>();

const text = computed({
  get: () => props.modelValue,
  set: (value: string) => emit("update:modelValue", value),
});

const { height: panelHeight, startResize } = useResizableHeight({
  defaultHeight: 128,
  minHeight: 96,
  maxHeight: 320,
  storageKey: "pi-example-chat-input-height",
});

const editorHeight = computed(() => Math.max(40, panelHeight.value - TOOLBAR_HEIGHT));

const composerRef = ref<InstanceType<typeof ChatComposer> | null>(null);

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

function focus() {
  composerRef.value?.focus();
}

defineExpose({ focus });
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
