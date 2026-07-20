<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[150]"
      @mousedown="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        class="session-context-menu fixed min-w-[120px] rounded-md border shadow-lg py-1"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @mousedown.stop
      >
        <button
          v-if="status !== 'finish'"
          type="button"
          class="session-context-menu__item w-full px-4 py-2 text-left text-[13px]"
          @click="emit('achieve')"
        >
          完成并归档
        </button>
        <button
          v-else
          type="button"
          class="session-context-menu__item w-full px-4 py-2 text-left text-[13px]"
          @click="emit('fork')"
        >
          Fork 后继续
        </button>
        <button
          type="button"
          class="session-context-menu__item w-full px-4 py-2 text-left text-[13px]"
          @click="emit('delete')"
        >
          删除
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean;
  x: number;
  y: number;
  status?: string;
}>();

const emit = defineEmits<{
  close: [];
  delete: [];
  achieve: [];
  fork: [];
}>();
</script>

<style scoped>
.session-context-menu {
  background: var(--app-popup-bg);
  border-color: var(--app-popup-border);
}

.session-context-menu__item {
  color: var(--app-text-primary);
  transition: background-color 0.15s;
}

.session-context-menu__item:last-child {
  color: #fa5151;
}

.session-context-menu__item:hover {
  background: var(--app-popup-hover);
}
</style>
