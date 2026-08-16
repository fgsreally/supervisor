<template>
  <Teleport to="body">
    <Transition name="message-menu" :duration="{ enter: 160, leave: 120 }">
      <div
        v-if="open && mode === 'menu' && !usageOpen"
        class="message-context-overlay"
        @mousedown="emit('close')"
        @contextmenu.prevent="emit('close')"
      >
        <div class="message-context-menu" :style="menuStyle" @mousedown.stop>
          <button
            v-if="canCopy"
            type="button"
            class="message-context-menu__item"
            @click="emit('copy')"
          >
            <Copy class="message-context-menu__icon" />
            <span>{{ t("chat.message.copy") }}</span>
          </button>

          <button
            v-if="showUsage"
            type="button"
            class="message-context-menu__item"
            @click="openUsage"
          >
            <Coins class="message-context-menu__icon" />
            <span>{{ t("chat.message.viewUsage") }}</span>
          </button>

          <button
            v-if="canRewind"
            type="button"
            class="message-context-menu__item"
            @click="emit('rewind')"
          >
            <Undo2 class="message-context-menu__icon" />
            <span>{{ t("chat.message.rewindHere") }}</span>
          </button>

          <div
            v-if="(canCopy || showUsage || canRewind) && canFork"
            class="message-context-menu__sep"
            role="separator"
          />

          <button
            v-if="canFork"
            type="button"
            class="message-context-menu__item"
            @click="emit('fork')"
          >
            <GitBranch class="message-context-menu__icon" />
            <span>{{ t("chat.message.forkHere") }}</span>
          </button>
        </div>
      </div>
    </Transition>

    <MobileDrawer
      :open="open && mode === 'sheet' && !usageOpen"
      :ariaLabel="t('chat.message.actions')"
      size="auto"
      show-footer
      @close="emit('close')"
    >
      <div class="message-sheet__actions">
        <button v-if="canCopy" type="button" @click="emit('copy')">{{ t("chat.message.copy") }}</button>
        <button v-if="showUsage" type="button" @click="openUsage">{{ t("chat.message.viewUsage") }}</button>
        <button v-if="canRewind" type="button" @click="emit('rewind')">{{ t("chat.message.rewindHere") }}</button>
        <button v-if="canFork" type="button" @click="emit('fork')">{{ t("chat.message.forkHere") }}</button>
      </div>
    </MobileDrawer>

    <UiDialog :open="usageOpen" :title="t('chat.message.usageTitle')" show-close @close="closeUsage">
      <div class="message-usage-dialog">
        <div class="message-usage-dialog__cost">
          <span>{{ t("chat.message.cost") }}</span>
          <strong>{{ usage ? formatCost(usage.cost.total) : t("chat.message.noRecord") }}</strong>
        </div>
        <div v-if="durationLabel" class="message-usage-dialog__row">
          <span>{{ t("chat.message.durationLabel") }}</span>
          <strong>{{ durationLabel }}</strong>
        </div>
        <template v-if="usage">
          <div class="message-usage-dialog__grid">
            <div>
              <span>{{ t("chat.message.input") }}</span>
              <strong>{{ formatTokens(usage.input) }}</strong>
            </div>
            <div>
              <span>{{ t("chat.message.output") }}</span>
              <strong>{{ formatTokens(usage.output) }}</strong>
            </div>
            <div>
              <span>{{ t("chat.message.cache") }}</span>
              <strong>{{ formatTokens(usage.cacheRead + usage.cacheWrite) }}</strong>
            </div>
          </div>
          <div class="message-usage-dialog__row">
            <span>{{ t("chat.message.totalTokens") }}</span>
            <strong>{{ formatTokens(usage.totalTokens) }}</strong>
          </div>
        </template>
        <p v-else class="message-usage-dialog__empty">{{ t("chat.message.noUsage") }}</p>
      </div>
    </UiDialog>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Coins, Copy, GitBranch, Undo2 } from "lucide-vue-next";
import type { MessageUsage } from "@/api";
import { MobileDrawer } from "@/components/mobile/ui";
import UiDialog from "@/components/base/UiDialog.vue";
import { useI18n } from "@/i18n";
const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    open: boolean;
    mode: "menu" | "sheet";
    x?: number;
    y?: number;
    canRewind?: boolean;
    canFork?: boolean;
    canCopy?: boolean;
    usage?: MessageUsage | null;
    showUsage?: boolean;
    durationLabel?: string | null;
  }>(),
  {
    x: 0,
    y: 0,
    canRewind: false,
    canFork: true,
    canCopy: false,
    showUsage: false,
    durationLabel: null,
  },
);

function formatCost(value: number) {
  if (!value) return "$0.00";
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}
function formatTokens(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    notation: value >= 10_000 ? "compact" : "standard",
  }).format(value);
}

const emit = defineEmits<{
  close: [];
  rewind: [];
  fork: [];
  copy: [];
}>();

const usageOpen = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) usageOpen.value = false;
  },
);

function openUsage() {
  usageOpen.value = true;
}

function closeUsage() {
  usageOpen.value = false;
  emit("close");
}

const MENU_WIDTH = 168;
const MENU_PAD = 8;

const menuStyle = computed(() => {
  const left = Math.min(Math.max(MENU_PAD, props.x), window.innerWidth - MENU_WIDTH - MENU_PAD);
  const top = Math.min(Math.max(MENU_PAD, props.y), window.innerHeight - 160);
  return { left: `${left}px`, top: `${top}px` };
});
</script>

<style scoped>
.message-context-overlay {
  position: fixed;
  z-index: 160;
  inset: 0;
}

.message-context-menu {
  position: fixed;
  z-index: 161;
  width: 168px;
  padding: 6px;
  border-radius: 10px;
  background: var(--app-popup-bg);
  box-shadow:
    0 0 0 0.5px rgb(0 0 0 / 6%),
    0 8px 28px rgb(0 0 0 / 14%);
  transform-origin: top left;
}

.message-menu-enter-active .message-context-menu {
  transition:
    opacity 0.16s ease,
    transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}
.message-menu-leave-active .message-context-menu {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}
.message-menu-enter-from .message-context-menu,
.message-menu-leave-to .message-context-menu {
  opacity: 0;
  transform: scale(0.94) translateY(-4px);
}

.message-context-menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--app-text-primary);
  font-size: 13px;
  line-height: 1;
  text-align: left;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}

.message-context-menu__item:hover,
.message-context-menu__item:focus-visible {
  background: #07c160;
  color: #fff;
  outline: none;
}

.message-context-menu__icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  opacity: 0.92;
}

.message-context-menu__sep {
  height: 1px;
  margin: 5px 6px;
  background: var(--app-border-subtle);
}

.message-sheet__actions {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: -14px -10px;
}

.message-sheet__actions > button {
  width: 100%;
  padding: 14px 16px;
  color: var(--m-text-primary, var(--app-text-primary));
  font-size: 15px;
  text-align: center;
}

.message-sheet__actions > button + button {
  border-top: 1px solid var(--m-divider, var(--app-border-subtle));
}

.message-sheet__actions > button:active {
  background: var(--m-pressed, var(--app-hover));
}

.message-usage-dialog {
  display: grid;
  gap: 14px;
}

.message-usage-dialog__cost,
.message-usage-dialog__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.message-usage-dialog__cost strong,
.message-usage-dialog__row strong {
  color: var(--app-text-primary);
  font-variant-numeric: tabular-nums;
}

.message-usage-dialog__cost strong {
  color: #07c160;
  font-size: 18px;
}

.message-usage-dialog__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.message-usage-dialog__grid > div {
  display: grid;
  gap: 4px;
  padding: 10px;
  border-radius: 8px;
  background: var(--app-hover);
}

.message-usage-dialog__grid span {
  color: var(--app-text-muted);
  font-size: 11px;
}

.message-usage-dialog__grid strong {
  color: var(--app-text-primary);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.message-usage-dialog__empty {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 13px;
}
</style>
