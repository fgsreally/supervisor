<template>
  <div v-if="inputs.length" class="queued-inputs-bar">
    <div v-for="input in inputs" :key="input.id" class="queued-inputs-bar__row">
      <p class="queued-inputs-bar__text" :title="input.message">{{ input.message }}</p>
      <div class="queued-inputs-bar__actions">
        <button
          type="button"
          class="queued-inputs-bar__btn"
          title="回到输入区修改"
          :disabled="busyId === input.id"
          @click="emit('edit', input)"
        >
          <Pencil class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="queued-inputs-bar__btn queued-inputs-bar__btn--submit"
          title="打断当前并立即发送"
          :disabled="busyId === input.id"
          @click="emit('submit', input)"
        >
          <SendHorizontal class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="queued-inputs-bar__btn queued-inputs-bar__btn--delete"
          title="删除"
          :disabled="busyId === input.id"
          @click="emit('delete', input)"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Pencil, SendHorizontal, Trash2 } from "lucide-vue-next";
import type { QueuedSessionInput } from "@/api";

defineProps<{
  inputs: QueuedSessionInput[];
  busyId?: string | null;
}>();

const emit = defineEmits<{
  edit: [input: QueuedSessionInput];
  submit: [input: QueuedSessionInput];
  delete: [input: QueuedSessionInput];
}>();
</script>

<style scoped>
.queued-inputs-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 12px 8px;
}

.queued-inputs-bar__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--app-border-subtle);
  background: color-mix(in srgb, var(--app-chat-bg) 88%, var(--app-text-muted));
}

.queued-inputs-bar__text {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-primary);
  font-size: 13px;
  line-height: 1.4;
}

.queued-inputs-bar__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.queued-inputs-bar__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.queued-inputs-bar__btn:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.queued-inputs-bar__btn--submit:hover:not(:disabled) {
  color: var(--app-accent, #07c160);
}

.queued-inputs-bar__btn--delete:hover:not(:disabled) {
  color: #e11d48;
}

.queued-inputs-bar__btn:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
