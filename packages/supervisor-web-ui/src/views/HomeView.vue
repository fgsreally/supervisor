<template>
  <div class="home-view">
    <header class="home-view__header">
      <h1>Dashboard</h1>
      <span>项目与工作动态概览</span>
    </header>

    <div class="home-view__dashboard custom-scrollbar">
      <section class="home-panel home-panel--timeline">
        <HomeTimeline :records="dailyRecords" :loading="dailyLoading" @refresh="loadDaily" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { listDailyWork, type DailyWorkRecord } from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import HomeTimeline from "../components/home/HomeTimeline.vue";
const dailyRecords = ref<DailyWorkRecord[]>([]);
const dailyLoading = ref(false);

async function loadDaily() {
  dailyLoading.value = true;
  try {
    dailyRecords.value = await listDailyWork({ limit: 21 });
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "读取工作分析失败", "error");
  } finally {
    dailyLoading.value = false;
  }
}

function onVisibilityChange() {
  if (document.hidden) return;
  void loadDaily();
}

onMounted(async () => {
  document.addEventListener("visibilitychange", onVisibilityChange);
  await loadDaily();
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", onVisibilityChange);
});
</script>

<style scoped>
.home-view {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  background: var(--app-settings-bg);
}
.home-view__header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-height: 40px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-settings-bg);
}
.home-view__header h1 {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text-primary);
}
.home-view__header span {
  font-size: 12px;
  color: var(--app-text-muted);
}
.home-view__dashboard {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 14px;
}
.home-panel {
  border-radius: 8px;
  border: 1px solid var(--app-border-subtle);
  background: var(--app-settings-card);
  overflow: hidden;
}
.home-panel--timeline {
  flex: none;
}
</style>
