<template>
  <Teleport to="body">
    <div
      v-if="open && !isMobile"
      class="fixed inset-0 z-[150]"
      @mousedown="emit('close')"
      @contextmenu.prevent="emit('close')"
      @selectstart.prevent
    >
      <div
        class="session-context-menu fixed min-w-[120px] rounded-md border shadow-lg py-1"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @mousedown.stop
        @selectstart.prevent
      >
        <button
          v-for="action in actions"
          :key="action.id"
          type="button"
          class="session-context-menu__item w-full px-4 py-2 text-left text-[13px]"
          :class="{ 'session-context-menu__item--danger': action.danger }"
          @click="runAction(action.id)"
        >
          {{ action.label }}
        </button>
      </div>
    </div>

    <MobileDrawer
      :open="open && isMobile"
      :ariaLabel="t('session.menu.actions')"
      size="auto"
      show-footer
      @close="emit('close')"
    >
      <div class="session-sheet__actions">
        <button
          v-for="action in actions"
          :key="`sheet-${action.id}`"
          type="button"
          :class="{ 'session-sheet__actions--danger': action.danger }"
          @click="runAction(action.id)"
        >
          {{ action.label }}
        </button>
      </div>
    </MobileDrawer>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/i18n";
import { MobileDrawer } from "@/components/mobile/ui";
import { useMobileViewport } from "@/composables/use-mobile-viewport";

const props = withDefaults(
  defineProps<{
    open: boolean;
    x: number;
    y: number;
    status?: string;
    pinned?: boolean;
    protectedSession?: boolean;
    canFork?: boolean;
  }>(),
  { canFork: true },
);

const emit = defineEmits<{
  close: [];
  delete: [];
  achieve: [];
  fork: [];
  pin: [];
  sync: [];
}>();

const isMobile = useMobileViewport();
const { t } = useI18n();

type ActionId = "pin" | "sync" | "achieve" | "fork" | "delete";

const actions = computed(() => {
  if (props.protectedSession) return [];
  const items: Array<{ id: ActionId; label: string; danger?: boolean }> = [
    { id: "pin", label: props.pinned ? t("session.menu.unpin") : t("session.menu.pin") },
  ];
  if (props.status !== "finish" && props.status !== "finished") {
    items.push(
      { id: "fork", label: t("session.menu.fork") },
      { id: "sync", label: t("session.menu.sync") },
      { id: "achieve", label: t("session.menu.achieve") },
    );
  } else {
    items.push({ id: "fork", label: t("session.menu.fork") });
  }
  items.push({ id: "delete", label: t("common.delete"), danger: true });
  return props.canFork === false ? items.filter((item) => item.id !== "fork") : items;
});

function runAction(id: ActionId) {
  switch (id) {
    case "pin":
      emit("pin");
      break;
    case "sync":
      emit("sync");
      break;
    case "achieve":
      emit("achieve");
      break;
    case "fork":
      emit("fork");
      break;
    case "delete":
      emit("delete");
      break;
  }
}
</script>

<style scoped>
.session-context-menu {
  background: var(--app-popup-bg);
  border-color: var(--app-popup-border);
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
}

.session-context-menu__item {
  color: var(--app-text-primary);
  transition: background-color 0.15s;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
}

.session-context-menu__item--danger {
  color: #fa5151;
}

.session-context-menu__item:hover {
  background: var(--app-popup-hover);
}

.session-sheet__actions {
  display: flex;
  flex-direction: column;
  margin: -14px -10px;
}

.session-sheet__actions > button {
  width: 100%;
  padding: 14px 16px;
  color: var(--m-text-primary, var(--app-text-primary));
  font-size: 15px;
  text-align: center;
}

.session-sheet__actions > button + button {
  border-top: 1px solid var(--m-divider, var(--app-border-subtle));
}

.session-sheet__actions--danger {
  color: #fa5151 !important;
}

.session-sheet__actions > button:active {
  background: var(--m-pressed, var(--app-hover));
}
</style>
