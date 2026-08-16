<template>
  <div v-if="visible" class="a2hs-hint" role="status">
    <div class="a2hs-hint__message">
      <span>{{ t("mobile.addToHome") }}</span>
      <button type="button" @click="dismiss">{{ t("mobile.gotIt") }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "@/i18n";

const STORAGE_KEY = "pi-supervisor-a2hs-dismissed-v2";
const visible = ref(false);
const { t } = useI18n();

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as { standalone?: boolean }).standalone))
  );
}

function dismiss() {
  localStorage.setItem(STORAGE_KEY, "1");
  visible.value = false;
}

onMounted(() => {
  const mobile = window.matchMedia("(max-width: 767px) and (pointer: coarse)").matches;
  visible.value = mobile && !isStandalone() && localStorage.getItem(STORAGE_KEY) !== "1";
});
</script>

<style scoped>
.a2hs-hint {
  position: fixed;
  z-index: 170;
  right: 10px;
  bottom: calc(62px + env(safe-area-inset-bottom));
  left: 10px;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.a2hs-hint__message {
  display: flex;
  width: min(100%, 430px);
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 13px;
  border-radius: 8px;
  color: var(--m-text-primary, var(--app-text-primary));
  background: var(--m-surface, var(--app-popup-bg));
  box-shadow: 0 4px 18px rgb(0 0 0 / 16%);
  pointer-events: auto;
}

.a2hs-hint__message span {
  min-width: 0;
  flex: 1;
  font-size: 13px;
  line-height: 1.45;
}

.a2hs-hint__message button {
  min-width: 62px;
  min-height: 34px;
  flex: none;
  padding: 0 10px;
  border-radius: 6px;
  color: #fff;
  background: #07c160;
  font-size: 13px;
  font-weight: 600;
}
</style>
