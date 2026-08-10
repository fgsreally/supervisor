<template>
  <div class="dashboard">
    <header class="dashboard__header">
      <div>
        <h1>Dashboard</h1>
        <p>跨项目查看会话推进、合并与代码提交</p>
      </div>
      <button type="button" :disabled="loading" @click="loadDashboard">
        <RefreshCw :class="{ spin: loading }" />刷新
      </button>
    </header>
    <main class="custom-scrollbar">
      <div v-if="loading && !dashboardReady" class="dashboard__loading">
        <Loader2 class="dashboard__spin" aria-hidden="true" />
        <span>加载 Dashboard...</span>
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
        <section class="overview">
          <article>
            <span>活跃项目</span><strong>{{ projects.length }}</strong
            ><small>{{ activeProjectCount }} 个正在推进</small>
          </article>
          <article>
            <span>进行中的 Session</span><strong>{{ runningCount }}</strong
            ><small>跨 {{ activeProjectCount }} 个项目</small>
          </article>
          <article>
            <span>已合并 Session</span><strong>{{ mergedCount }}</strong
            ><small>{{ totalCommits }} 个相关提交</small>
          </article>
        </section>

        <ProjectSessionTimeline
          :projects="projects"
          :sessions="sessions"
          :commits="commits"
          :events="events"
          :loading="loading"
          @open-session="emit('open-session', $event)"
        />

        <section class="daily-analysis">
          <div class="daily-analysis__copy">
            <h2>每日分析</h2>
            <p>保留历史分析与 commit 明细，按日期回看项目产出</p>
          </div>
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

const emit = defineEmits<{ "open-session": [sessionId: string] }>();
const projects = ref<Project[]>([]);
const sessions = ref<Session[]>([]);
const commits = ref<Record<string, WorktreeCommit[]>>({});
const events = ref<TimelineEvent[]>([]);
const dailyRecords = ref<DailyWorkRecord[]>([]);
const loading = ref(false);
const dailyLoading = ref(false);
const dashboardReady = ref(false);
const visibleSessions = computed(() =>
  sessions.value.filter((session) => session.showInSessionList !== false),
);
const runningCount = computed(
  () => visibleSessions.value.filter((session) => session.status === "running").length,
);
const mergedCount = computed(
  () => visibleSessions.value.filter((session) => session.status === "finish").length,
);
const activeProjectCount = computed(
  () =>
    new Set(
      visibleSessions.value
        .filter((session) => session.status === "running")
        .map((session) => session.projectId)
        .filter(Boolean),
    ).size,
);
const totalCommits = computed(() =>
  Object.values(commits.value).reduce((sum, rows) => sum + rows.length, 0),
);

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
    showUiMessage(error instanceof Error ? error.message : "Dashboard 加载失败", "error");
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
    showUiMessage("每日分析已更新", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "每日分析更新失败", "error");
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
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 18px;
  border-bottom: 1px solid var(--app-border);
}
.dashboard__header h1 {
  font-size: 17px;
  font-weight: 680;
}
.dashboard__header p {
  margin-top: 2px;
  color: var(--app-text-muted);
  font-size: 11px;
}
.dashboard__header button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 10px;
  border-radius: 7px;
  color: var(--app-text-secondary);
  background: var(--app-hover);
  font-size: 11px;
}
.dashboard__header svg {
  width: 13px;
  height: 13px;
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
  gap: 14px;
  overflow: auto;
  padding: 16px;
}
.overview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.overview article {
  display: grid;
  gap: 3px;
  padding: 13px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-settings-card);
}
.overview span {
  color: var(--app-text-secondary);
  font-size: 10px;
}
.overview strong {
  font-size: 22px;
}
.overview small {
  color: var(--app-text-muted);
  font-size: 9px;
}
.daily-analysis {
  border: 1px solid var(--app-border-subtle);
  border-radius: 12px;
  background: var(--app-settings-card);
}
.daily-analysis__copy {
  padding: 15px 18px 3px;
}
.daily-analysis__copy h2 {
  font-size: 15px;
  font-weight: 650;
}
.daily-analysis__copy p {
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 11px;
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
@media (max-width: 640px) {
  .dashboard {
    overflow-x: hidden;
    background: var(--m-page-bg, var(--app-settings-bg));
  }
  .dashboard__header {
    display: none;
  }
  main {
    width: 100%;
    overflow-x: hidden;
    padding: 14px 16px 24px;
  }
  .overview {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .overview article {
    min-width: 0;
    padding: 12px;
    border-radius: 12px;
  }
  .overview strong {
    font-size: 20px;
  }
  .overview small {
    display: block;
  }
  .daily-analysis {
    min-width: 0;
    overflow: hidden;
  }
}
</style>
