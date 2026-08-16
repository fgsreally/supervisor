<template>
  <Teleport to="body">
    <div
      v-if="open && !isMobile"
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
          {{ t("project.delete") }}
        </button>
      </div>
    </div>

    <SheetDrawer
      :open="open && isMobile"
      :ariaLabel="t('project.actions')"
      size="auto"
      show-footer
      @close="emit('close')"
    >
      <div class="project-list-sheet">
        <button type="button" class="project-list-sheet__danger" @click="emit('delete')">
          {{ t("project.delete") }}
        </button>
      </div>
    </SheetDrawer>
  </Teleport>
</template>

<script setup lang="ts">
import SheetDrawer from "@/components/base/SheetDrawer.vue";
import { useMobileViewport } from "@/composables/use-mobile-viewport";
import { useI18n } from "@/i18n";

defineProps<{ open: boolean; x: number; y: number }>();
const emit = defineEmits<{ close: []; delete: [] }>();
const isMobile = useMobileViewport();
const { t } = useI18n();
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

.project-list-sheet {
  display: flex;
  flex-direction: column;
  margin: -14px -10px;
}

.project-list-sheet__danger {
  width: 100%;
  padding: 14px 16px;
  color: #fa5151;
  font-size: 15px;
  text-align: center;
}

.project-list-sheet__danger:active {
  background: var(--m-pressed, var(--app-hover));
}
</style>
