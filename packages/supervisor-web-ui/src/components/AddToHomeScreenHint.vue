<template>
  <div v-if="visible" class="a2hs-hint" role="dialog" aria-label="添加到主屏幕">
    <div class="a2hs-hint__card">
      <p class="a2hs-hint__title">添加到主屏幕</p>
      <p class="a2hs-hint__body">{{ body }}</p>
      <button type="button" class="a2hs-hint__dismiss" @click="dismiss">知道了</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

const STORAGE_KEY = "pi-supervisor-a2hs-dismissed";

const visible = ref(false);
const isIos = ref(false);

const body = computed(() =>
  isIos.value
    ? "在 Safari 底部点“分享”，再选择“添加到主屏幕”。下次可以像 App 一样打开。"
    : "在浏览器菜单中选择“添加到主屏幕”或“安装应用”。下次可以像 App 一样打开。",
);

function isStandalone(): boolean {
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const nav =
    "standalone" in navigator && Boolean((navigator as { standalone?: boolean }).standalone);
  return mq || nav;
}

function shouldShow(): boolean {
  if (typeof window === "undefined") return false;
  if (isStandalone()) return false;
  if (localStorage.getItem(STORAGE_KEY) === "1") return false;
  const narrow = window.matchMedia("(max-width: 900px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return narrow || coarse;
}

function dismiss() {
  localStorage.setItem(STORAGE_KEY, "1");
  visible.value = false;
}

onMounted(() => {
  isIos.value = /iPad|iPhone|iPod/.test(navigator.userAgent);
  visible.value = shouldShow();
});
</script>

<style scoped>
.a2hs-hint {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 170;
  padding: 0 12px calc(12px + env(safe-area-inset-bottom));
  pointer-events: none;
}

.a2hs-hint__card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px 14px;
  pointer-events: auto;
  max-width: 430px;
  margin: 0 auto;
  padding: 16px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 12px;
  color: var(--app-text-primary);
  background: var(--app-popup-bg);
  box-shadow: 0 -6px 28px rgb(0 0 0 / 18%);
}

.a2hs-hint__title {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
}

.a2hs-hint__body {
  margin: 0;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.55;
}

.a2hs-hint__dismiss {
  appearance: none;
  min-width: 88px;
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  color: #fff;
  background: #07c160;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

@media (max-width: 380px) {
  .a2hs-hint__card {
    gap: 10px;
    padding: 14px;
  }

  .a2hs-hint__body {
    font-size: 13px;
  }

  .a2hs-hint__dismiss {
    min-width: 80px;
    padding-inline: 12px;
  }
}

.a2hs-hint__dismiss:active {
  background: #06ad56;
}
</style>
