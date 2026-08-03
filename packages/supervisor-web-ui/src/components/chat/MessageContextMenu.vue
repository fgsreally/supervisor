<template>
  <Teleport to="body">
    <Transition name="message-menu" :duration="{ enter: 160, leave: 120 }">
      <div
        v-if="open && mode === 'menu'"
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
            <span>复制</span>
          </button>

          <div v-if="usage" class="message-context-menu__usage">
            <div>
              <Coins class="message-context-menu__icon" /><strong>本条用量</strong
              ><b>{{ formatCost(usage.cost.total) }}</b>
            </div>
            <span>输入 {{ formatTokens(usage.input) }}</span>
            <span>输出 {{ formatTokens(usage.output) }}</span>
            <span>缓存 {{ formatTokens(usage.cacheRead + usage.cacheWrite) }}</span>
          </div>

          <button
            v-if="canRewind"
            type="button"
            class="message-context-menu__item"
            @click="emit('rewind')"
          >
            <Undo2 class="message-context-menu__icon" />
            <span>回到这里</span>
          </button>

          <div
            v-if="(canCopy || canRewind) && canFork"
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
            <span>从此消息分支</span>
          </button>
        </div>
      </div>
    </Transition>

    <Transition name="chat-sheet" :duration="{ enter: 300, leave: 180 }">
      <div
        v-if="open && mode === 'sheet'"
        class="message-sheet-backdrop"
        @click.self="emit('close')"
      >
        <section class="message-sheet">
          <div v-if="usage" class="message-sheet__usage">
            <strong>本条用量 {{ formatCost(usage.cost.total) }}</strong>
            <span>{{ formatTokens(usage.totalTokens) }} tokens</span>
          </div>
          <button v-if="canCopy" type="button" @click="emit('copy')">复制</button>
          <button v-if="canRewind" type="button" @click="emit('rewind')">回到这里</button>
          <button v-if="canFork" type="button" @click="emit('fork')">从此消息分支</button>
          <button type="button" class="message-sheet__cancel" @click="emit('close')">取消</button>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Coins, Copy, GitBranch, Undo2 } from "lucide-vue-next";
import type { MessageUsage } from "@/api";

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
  }>(),
  {
    x: 0,
    y: 0,
    canRewind: false,
    canFork: true,
    canCopy: false,
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
.message-context-menu__usage {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin: 4px 2px 6px;
  padding: 9px;
  border-radius: 7px;
  color: var(--app-text-muted);
  background: var(--app-hover);
  font-size: 10px;
}
.message-context-menu__usage div {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-primary);
}
.message-context-menu__usage b {
  margin-left: auto;
  color: #07c160;
  font-variant-numeric: tabular-nums;
}
.message-sheet__usage {
  display: flex;
  justify-content: space-between;
  padding: 14px;
  border-radius: 12px;
  background: var(--app-popup-bg);
  color: var(--app-text-primary);
  font-size: 13px;
}
.message-sheet__usage span {
  color: var(--app-text-muted);
}

.message-sheet-backdrop {
  position: fixed;
  z-index: 160;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 30%);
}

.message-sheet {
  width: 100%;
  padding: 8px 10px calc(10px + env(safe-area-inset-bottom));
}

.message-sheet button {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  color: var(--app-text-primary);
  background: var(--app-popup-bg);
  font-size: 15px;
  transition:
    transform 0.12s ease,
    background-color 0.12s ease;
}

.message-sheet button:active {
  transform: scale(0.985);
}

.message-sheet button + button {
  margin-top: 8px;
}

.message-sheet__cancel {
  color: var(--app-text-secondary) !important;
}
</style>
