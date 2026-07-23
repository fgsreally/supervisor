<template>
  <div class="home-view">
    <header class="home-view__header">
      <h1>首页</h1>
      <span>工作分析与任务看板</span>
    </header>

    <div class="home-view__dashboard custom-scrollbar">
      <section class="home-panel home-panel--timeline">
        <HomeTimeline :records="dailyRecords" :loading="dailyLoading" @refresh="loadDaily" />
      </section>

      <section class="home-panel home-panel--board">
        <HomeTaskBoard
          :tasks="tasks"
          :projects="projects"
          :busy-id="busyId"
          @create="composerOpen = true"
          @decompose="onDecompose"
          @open-session="onOpenSession"
        />
      </section>
    </div>

    <HomeTaskComposer
      :open="composerOpen"
      :projects="projects"
      :busy="creating"
      @close="composerOpen = false"
      @create="onCreate"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import {
  createHomeTask,
  decomposeHomeTask,
  listDailyWork,
  listHomeTasks,
  type DailyWorkRecord,
  type HomeTask,
  type HomeTaskPriority,
  type Project,
} from "@/api";
import { useSessionStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import HomeTimeline from "../components/home/HomeTimeline.vue";
import HomeTaskBoard from "../components/home/HomeTaskBoard.vue";
import HomeTaskComposer from "../components/home/HomeTaskComposer.vue";

const emit = defineEmits<{
  "open-session": [sessionId: string];
}>();

const sessionStore = useSessionStore();
const projects = ref<Project[]>([]);
const tasks = ref<HomeTask[]>([]);
const dailyRecords = ref<DailyWorkRecord[]>([]);
const dailyLoading = ref(false);
const creating = ref(false);
const composerOpen = ref(false);
const busyId = ref<number | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function loadProjects() {
  await sessionStore.fetchProjects();
  projects.value = sessionStore.projects;
}

async function loadTasks() {
  tasks.value = await listHomeTasks();
}

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

async function onCreate(payload: {
  title: string;
  description: string;
  projectId: number | null;
  priority: HomeTaskPriority;
}) {
  creating.value = true;
  try {
    await createHomeTask(payload);
    await loadTasks();
    composerOpen.value = false;
    showUiMessage("任务已创建", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "创建任务失败", "error");
  } finally {
    creating.value = false;
  }
}

async function onDecompose(task: HomeTask) {
  busyId.value = task.id;
  try {
    await decomposeHomeTask(task.id);
    await loadTasks();
    showUiMessage("任务已分解并创建会话", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "任务分解失败", "error");
  } finally {
    busyId.value = null;
  }
}

function onOpenSession(task: HomeTask) {
  if (task.sessionId == null) return;
  emit("open-session", String(task.sessionId));
}

onMounted(async () => {
  await Promise.all([loadProjects(), loadTasks(), loadDaily()]);
  pollTimer = setInterval(() => {
    void loadTasks();
  }, 5000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
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
.home-panel--board {
  flex: none;
  height: min(42vh, 360px);
  min-height: 220px;
  display: flex;
  flex-direction: column;
}
</style>
