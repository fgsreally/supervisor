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
    ? "在 Safari 底部点「分享」，再选择「添加到主屏幕」，即可像 App 一样打开。"
    : "在浏览器菜单中选择「添加到主屏幕」或「安装应用」，方便下次快速打开。",
);

function isStandalone(): boolean {
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const nav = "standalone" in navigator && Boolean((navigator as { standalone?: boolean }).standalone);
  return mq || nav;
}

function shouldShow(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.protocol !== "https:") return false;
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
  z-index: 80;
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
  pointer-events: none;
}

.a2hs-hint__card {
  pointer-events: auto;
  max-width: 420px;
  margin: 0 auto;
  padding: 14px 16px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-shell-bg, #111) 92%, #000);
  color: var(--app-fg, #f5f5f5);
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
}

.a2hs-hint__title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
}

.a2hs-hint__body {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.45;
  opacity: 0.85;
}

.a2hs-hint__dismiss {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: color-mix(in srgb, currentColor 14%, transparent);
  color: inherit;
}
</style>
