<template>
  <div class="todo-view">
    <header class="todo-view__header">
      <div>
        <h1>Todo / 计划</h1>
        <span>集中管理目标、计划与待办事项</span>
      </div>
      <button type="button" @click="composerOpen = true"><Plus />新建</button>
    </header>
    <main class="todo-view__content custom-scrollbar">
      <section class="todo-panel">
        <HomeTaskBoard
          :tasks="tasks"
          :projects="projects"
          :busy-id="busyId"
          @create="composerOpen = true"
          @decompose="onDecompose"
          @open-session="onOpenSession"
        />
      </section>
    </main>
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
import { Plus } from "lucide-vue-next";
import {
  createHomeTask,
  decomposeHomeTask,
  listHomeTasks,
  type HomeTask,
  type HomeTaskPriority,
  type Project,
} from "@/api";
import { useSessionStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import HomeTaskBoard from "@/components/home/HomeTaskBoard.vue";
import HomeTaskComposer from "@/components/home/HomeTaskComposer.vue";

const emit = defineEmits<{ "open-session": [sessionId: string] }>();
const sessionStore = useSessionStore();
const projects = ref<Project[]>([]);
const tasks = ref<HomeTask[]>([]);
const creating = ref(false);
const composerOpen = ref(false);
const busyId = ref<number | null>(null);

async function load() {
  await sessionStore.fetchProjects();
  projects.value = sessionStore.projects;
  tasks.value = await listHomeTasks();
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
    tasks.value = await listHomeTasks();
    composerOpen.value = false;
    showUiMessage("Todo 已创建", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "创建 Todo 失败", "error");
  } finally {
    creating.value = false;
  }
}
async function onDecompose(task: HomeTask) {
  busyId.value = task.id;
  try {
    await decomposeHomeTask(task.id);
    tasks.value = await listHomeTasks();
    showUiMessage("已生成计划并创建会话", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "任务分解失败", "error");
  } finally {
    busyId.value = null;
  }
}
function onOpenSession(task: HomeTask) {
  if (task.sessionId != null) emit("open-session", String(task.sessionId));
}
function onVisibilityChange() {
  if (!document.hidden) void load();
}
onMounted(() => {
  document.addEventListener("visibilitychange", onVisibilityChange);
  void load();
});
onUnmounted(() => document.removeEventListener("visibilitychange", onVisibilityChange));
</script>

<style scoped>
.todo-view {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  background: var(--app-settings-bg);
}
.todo-view__header {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  border-bottom: 1px solid var(--app-border);
}
.todo-view__header h1 {
  color: var(--app-text-primary);
  font-size: 16px;
  font-weight: 650;
}
.todo-view__header span {
  display: block;
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 11px;
}
.todo-view__header button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border-radius: 7px;
  background: var(--app-accent);
  color: white;
  font-size: 12px;
}
.todo-view__header button svg {
  width: 14px;
  height: 14px;
}
.todo-view__content {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 14px;
}
.todo-panel {
  height: 100%;
  min-height: 360px;
  overflow: hidden;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-settings-card);
}
</style>
