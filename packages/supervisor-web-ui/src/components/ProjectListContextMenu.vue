<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[150]"
      @mousedown="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        class="project-list-menu fixed min-w-[120px] rounded-md border py-1 shadow-lg"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @mousedown.stop
      >
        <button
          type="button"
          class="project-list-menu__delete w-full px-4 py-2 text-left text-[13px]"
          @click="emit('delete')"
        >
          删除项目
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{ open: boolean; x: number; y: number }>();
const emit = defineEmits<{ close: []; delete: [] }>();
</script>

<style scoped>
.project-list-menu {
  background: var(--app-popup-bg);
  border-color: var(--app-popup-border);
}

.project-list-menu__delete {
  color: #fa5151;
}

.project-list-menu__delete:hover {
  background: var(--app-popup-hover);
}
</style>
