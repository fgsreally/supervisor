<template>
  <div class="dashboard">
    <header class="dashboard__header">
      <div>
        <h1>工作概览</h1>
        <p>跨项目看推进与提交</p>
      </div>
      <button
        type="button"
        class="dashboard__refresh"
        aria-label="刷新"
        :disabled="loading"
        @click="loadDashboard"
      >
        <RefreshCw :class="{ spin: loading }" />
      </button>
    </header>
    <main class="custom-scrollbar">
      <div v-if="loading && !dashboardReady" class="dashboard__loading">
        <Loader2 class="dashboard__spin" aria-hidden="true" />
        <span>加载工作概览...</span>
      </div>
      <UiEmptyState
        v-else-if="dashboardReady && !projects.length && !visibleSessions.length"
        class="dashboard__empty"
        title="暂无数据"
        description="创建项目并开始会话后，这里会汇总项目推进与提交记录。"
      >
        <template #icon><LayoutDashboard /></template>
      </UiEmptyState>
      <template v-else>
        <section class="status-bar" aria-label="工作状态">
          <button
            type="button"
            :class="{ active: statusFilter === 'running' }"
            @click="toggleFilter('running')"
          >
            <strong>{{ runningCount }}</strong>
            <span>进行中</span>
          </button>
          <button
            type="button"
            :class="{ active: statusFilter === 'attention' }"
            @click="toggleFilter('attention')"
          >
            <strong>{{ attentionCount }}</strong>
            <span>需处理</span>
          </button>
          <button
            type="button"
            :class="{ active: statusFilter === 'finish' }"
            @click="toggleFilter('finish')"
          >
            <strong>{{ mergedCount }}</strong>
            <span>已合并</span>
          </button>
          <button
            type="button"
            :class="{ active: statusFilter === 'commits' }"
            @click="toggleFilter('commits')"
          >
            <strong>{{ totalCommits }}</strong>
            <span>提交</span>
          </button>
        </section>

        <section v-if="attentionSessions.length" class="attention">
          <header class="attention__header">
            <h2>需关注</h2>
            <span>{{ attentionSessions.length }}</span>
          </header>
          <ul class="attention__list">
            <li v-for="session in attentionSessions" :key="session.id">
              <button type="button" @click="emit('open-session', session.id)">
                <span class="attention__dot" :data-status="session.status" />
                <span class="attention__body">
                  <strong>{{ session.title || `Session ${session.id}` }}</strong>
                  <small
                    >{{ projectName(session.projectId) }} · {{ statusLabel(session.status) }}</small
                  >
                </span>
                <em>打开</em>
              </button>
            </li>
          </ul>
        </section>

        <ProjectSessionTimeline
          :projects="projects"
          :sessions="sessions"
          :commits="commits"
          :events="events"
          :loading="loading"
          :status-filter="statusFilter"
          @open-session="emit('open-session', $event)"
        />

        <section class="daily-analysis">
          <HomeTimeline :records="dailyRecords" :loading="dailyLoading" @refresh="refreshDaily" />
        </section>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { LayoutDashboard, Loader2, RefreshCw } from "lucide-vue-next";
import {
  getSessionCommits,
  listDailyWork,
  listProjects,
  listSessions,
  listTimelineEvents,
  runDailyWork,
  type DailyWorkRecord,
  type Project,
  type Session,
  type WorktreeCommit,
  type TimelineEvent,
} from "@/api";
import HomeTimeline from "@/components/home/HomeTimeline.vue";
import ProjectSessionTimeline from "@/components/home/ProjectSessionTimeline.vue";
import UiEmptyState from "@/components/ui/UiEmptyState.vue";
import { showUiMessage } from "@/composables/use-ui-message";

type DashboardStatusFilter = "running" | "attention" | "finish" | "commits" | null;

const emit = defineEmits<{ "open-session": [sessionId: string] }>();
const projects = ref<Project[]>([]);
const sessions = ref<Session[]>([]);
const commits = ref<Record<string, WorktreeCommit[]>>({});
const events = ref<TimelineEvent[]>([]);
const dailyRecords = ref<DailyWorkRecord[]>([]);
const loading = ref(false);
const dailyLoading = ref(false);
const dashboardReady = ref(false);
const statusFilter = ref<DashboardStatusFilter>(null);

const visibleSessions = computed(() =>
  sessions.value.filter((session) => session.showInSessionList !== false),
);
const runningCount = computed(
  () => visibleSessions.value.filter((session) => session.status === "running").length,
);
const mergedCount = computed(
  () =>
    visibleSessions.value.filter(
      (session) => session.status === "finish" || session.status === "finished",
    ).length,
);
const attentionSessions = computed(() =>
  visibleSessions.value.filter(
    (session) => session.status === "blocked" || session.status === "error",
  ),
);
const attentionCount = computed(() => attentionSessions.value.length);
const totalCommits = computed(() =>
  Object.values(commits.value).reduce((sum, rows) => sum + rows.length, 0),
);
const projectMap = computed(() => new Map(projects.value.map((project) => [project.id, project])));

function toggleFilter(next: Exclude<DashboardStatusFilter, null>) {
  statusFilter.value = statusFilter.value === next ? null : next;
}

function projectName(projectId?: string | null) {
  if (!projectId) return "未关联项目";
  return projectMap.value.get(projectId)?.name || "未知项目";
}

function statusLabel(status: Session["status"]) {
  return (
    (
      {
        finish: "已合并",
        finished: "已合并",
        running: "进行中",
        blocked: "需处理",
        error: "异常",
        idle: "待命",
        initializing: "准备中",
        stopped: "已停止",
      } as Record<string, string>
    )[status] || status
  );
}

async function loadDashboard() {
  if (loading.value) return;
  loading.value = true;
  try {
    const [nextProjects, nextSessions, records, nextEvents] = await Promise.all([
      listProjects(),
      listSessions(),
      listDailyWork({ limit: 30 }),
      listTimelineEvents({ type: "session" }),
    ]);
    projects.value = nextProjects;
    sessions.value = nextSessions;
    dailyRecords.value = records;
    events.value = nextEvents;
    const rows = await Promise.all(
      nextSessions
        .filter((session) => session.projectId && session.showInSessionList !== false)
        .map(
          async (session) =>
            [session.id, await getSessionCommits(session.id).catch(() => [])] as const,
        ),
    );
    commits.value = Object.fromEntries(rows);
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "工作概览加载失败", "error");
  } finally {
    loading.value = false;
    dashboardReady.value = true;
  }
}
async function refreshDaily() {
  dailyLoading.value = true;
  try {
    await runDailyWork();
    dailyRecords.value = await listDailyWork({ limit: 30 });
    showUiMessage("近日产出已更新", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "近日产出更新失败", "error");
  } finally {
    dailyLoading.value = false;
  }
}
onMounted(loadDashboard);
</script>

<style scoped>
.dashboard {
  display: flex;
  height: 100%;
  flex-direction: column;
  color: var(--app-text-primary);
  background: var(--app-settings-bg);
}
.dashboard__header {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-settings-card);
}
.dashboard__header h1 {
  font-size: 17px;
  font-weight: 650;
}
.dashboard__header p {
  margin-top: 2px;
  color: var(--app-text-muted);
  font-size: 12px;
}
.dashboard__refresh {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 8px;
  color: var(--app-text-secondary);
  background: transparent;
}
.dashboard__refresh:hover:not(:disabled) {
  background: var(--app-hover);
}
.dashboard__refresh:disabled {
  opacity: 0.55;
}
.dashboard__refresh svg {
  width: 16px;
  height: 16px;
}
.dashboard__loading {
  display: flex;
  min-height: 240px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--app-text-muted);
  font-size: var(--app-font-control, 0.8125rem);
}
.dashboard__spin {
  width: 22px;
  height: 22px;
  animation: dashboard-spin 0.8s linear infinite;
}
.dashboard__empty {
  margin: 48px auto;
}
.spin {
  animation: spin 0.8s linear infinite;
}
main {
  display: grid;
  min-height: 0;
  flex: 1;
  align-content: start;
  gap: 16px;
  overflow: auto;
  padding: 16px 20px 24px;
}
.status-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-settings-card);
}
.status-bar button {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 12px 10px;
  text-align: left;
  border-right: 1px solid var(--app-border-subtle);
}
.status-bar button:last-child {
  border-right: 0;
}
.status-bar button:hover {
  background: var(--app-hover);
}
.status-bar button.active {
  background: color-mix(in srgb, var(--app-accent) 10%, var(--app-settings-card));
}
.status-bar strong {
  font-size: 22px;
  font-weight: 650;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.status-bar button.active strong {
  color: var(--app-accent);
}
.status-bar span {
  color: var(--app-text-muted);
  font-size: 12px;
}
.attention {
  overflow: hidden;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-settings-card);
}
.attention__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
}
.attention__header h2 {
  font-size: 15px;
  font-weight: 650;
}
.attention__header span {
  color: var(--app-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.attention__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.attention__list button {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--app-border-subtle);
  text-align: left;
}
.attention__list button:hover {
  background: var(--app-hover);
}
.attention__dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: #fa5151;
}
.attention__dot[data-status="blocked"] {
  background: #f2994a;
}
.attention__body {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}
.attention__body strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attention__body small {
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attention__list em {
  flex: none;
  color: var(--app-accent);
  font-size: 12px;
  font-style: normal;
}
.daily-analysis {
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-settings-card);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes dashboard-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 767px) {
  .dashboard {
    overflow-x: hidden;
    background: var(--m-page-bg, var(--app-settings-bg));
  }
  .dashboard__header {
    display: none;
  }
  main {
    width: 100%;
    gap: 12px;
    overflow-x: hidden;
    padding: 12px var(--m-page-inline, 16px) 24px;
  }
  .status-bar {
    display: flex;
    gap: 0;
    overflow-x: auto;
    border-radius: 8px;
    -webkit-overflow-scrolling: touch;
  }
  .status-bar button {
    min-width: 4.75rem;
    flex: 1 0 auto;
    padding: 12px;
    text-align: center;
  }
  .status-bar strong {
    font-size: 20px;
  }
  .status-bar span {
    font-size: 11px;
  }
  .attention,
  .daily-analysis {
    min-width: 0;
    overflow: hidden;
    border-radius: 8px;
  }
  .attention__list button {
    min-height: 56px;
    padding: 12px var(--m-page-inline, 16px);
  }
  .attention__header {
    padding: 12px var(--m-page-inline, 16px) 8px;
  }
}
</style>
