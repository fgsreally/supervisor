<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[150]"
      @mousedown="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        class="project-git-menu fixed w-[180px] rounded-lg border shadow-lg p-1.5"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @mousedown.stop
      >
        <button
          type="button"
          class="project-git-menu__item"
          :disabled="busy"
          @click="emit('pull')"
        >
          <ArrowDownToLine class="h-3.5 w-3.5 shrink-0" />
          Git Pull
        </button>
        <button
          type="button"
          class="project-git-menu__item"
          :disabled="busy"
          @click="emit('push')"
        >
          <ArrowUpFromLine class="h-3.5 w-3.5 shrink-0" />
          Git Push
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-vue-next";

defineProps<{
  open: boolean;
  x: number;
  y: number;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  pull: [];
  push: [];
}>();
</script>

<style scoped>
.project-git-menu {
  background: var(--app-popup-bg);
  border-color: var(--app-popup-border);
  color: var(--app-text-primary);
}

.project-git-menu__item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  text-align: left;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--app-text-primary);
  transition: background-color 0.15s;
}

.project-git-menu__item:hover:not(:disabled) {
  background: var(--app-popup-hover);
}

.project-git-menu__item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
