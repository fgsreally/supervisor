<template>
  <div v-if="totalCount" class="jobs-popover-wrap">
    <button
      class="jobs-summary chat-context-button"
      type="button"
      :title="summaryTitle"
      @click="open = !open"
    >
      <Activity class="h-4 w-4" />
      <span>{{ totalCount }}</span>
    </button>

    <section v-if="open" class="jobs-popover" aria-label="Jobs">
      <header>
        <div>
          <strong>Jobs</strong>
          <span v-if="activeCount">{{ activeCount }} 个进行中</span>
        </div>
        <button type="button" title="刷新" @click="refresh">
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
        </button>
      </header>

      <div v-if="schedules.length" class="jobs-section">
        <div class="jobs-section__title">计划</div>
        <button
          v-for="schedule in schedules"
          :key="`schedule-${schedule.id}`"
          class="job-item"
          type="button"
          @click="openSchedule(schedule)"
        >
          <Clock3 class="job-item__icon h-3.5 w-3.5" />
          <span class="job-item__main">
            <span class="job-item__label">{{ schedule.label }}</span>
            <span class="job-item__meta">
              {{ formatTime(schedule.nextRunAt) }}
              <template v-if="schedule.intervalMs">
                · 每 {{ formatInterval(schedule.intervalMs) }}
              </template>
              <template v-else>· 一次性</template>
            </span>
          </span>
          <ChevronRight class="h-3.5 w-3.5" />
        </button>
      </div>

      <div v-if="jobs.length" class="jobs-section">
        <div class="jobs-section__title">运行记录</div>
        <div v-for="job in visibleJobs" :key="job.id" class="job-row">
          <button class="job-item" type="button" @click="openJob(job)">
            <span class="job-status" :class="`job-status--${job.status}`" />
            <span class="job-item__main">
              <span class="job-item__label">{{ job.label }}</span>
              <span class="job-item__meta">
                {{ kindLabel(job.kind) }} · {{ statusLabel(job.status) }} ·
                {{ formatDuration(job) }}
              </span>
            </span>
            <ChevronRight class="h-3.5 w-3.5" />
          </button>

          <div v-if="expandedId === job.id" class="job-inline-detail">
            <pre>{{ job.output || formatValue(job.result ?? job.error) || "(暂无输出)" }}</pre>
            <form
              v-if="job.capabilities.includes('input') && job.status === 'running'"
              @submit.prevent="send(job.id)"
            >
              <input v-model="inputs[job.id]" type="text" placeholder="发送到 stdin" />
              <button type="submit" :disabled="!inputs[job.id]?.trim()">发送</button>
            </form>
            <button
              v-if="job.capabilities.includes('cancel') && isActive(job.status)"
              class="job-cancel"
              type="button"
              @click="cancel(job.id)"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { Activity, ChevronRight, Clock3, RefreshCw } from "lucide-vue-next";
import {
  cancelSessionJob,
  getSessionJobs,
  sendSessionJobInput,
  type JobStatus,
  type SessionJob,
  type SessionJobSchedule,
} from "@/api";

export interface JobDetailRequest {
  title: string;
  sections: Array<{ label: string; content: string }>;
  presentation: "modal" | "panel";
  terminal?: "bash";
}

const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ detail: [request: JobDetailRequest] }>();
const jobs = ref<SessionJob[]>([]);
const schedules = ref<SessionJobSchedule[]>([]);
const open = ref(false);
const loading = ref(false);
const expandedId = ref<string>();
const inputs = reactive<Record<string, string>>({});
let poll: ReturnType<typeof setInterval> | undefined;

const visibleJobs = computed(() => jobs.value.slice(0, 12));
const activeCount = computed(() => jobs.value.filter((job) => isActive(job.status)).length);
const totalCount = computed(() => schedules.value.length + jobs.value.length);
const summaryTitle = computed(() => {
  const parts = [`${totalCount.value} 个 Job`];
  if (activeCount.value) parts.push(`${activeCount.value} 个进行中`);
  if (schedules.value.length) parts.push(`${schedules.value.length} 个计划`);
  return parts.join(" · ");
});

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const snapshot = await getSessionJobs(props.sessionId);
    jobs.value = snapshot.jobs;
    schedules.value = snapshot.schedules;
    if (snapshot.jobs.length + snapshot.schedules.length === 0) open.value = false;
  } catch {
    jobs.value = [];
    schedules.value = [];
  } finally {
    loading.value = false;
  }
}

function isActive(status: JobStatus): boolean {
  return status === "queued" || status === "running" || status === "waiting";
}

function openJob(job: SessionJob): void {
  const output = job.output || formatValue(job.result ?? job.error) || "(暂无输出)";
  const lines = output.split(/\r?\n/).length;
  if (output.length <= 600 && lines <= 6) {
    expandedId.value = expandedId.value === job.id ? undefined : job.id;
    return;
  }
  emit("detail", {
    title: job.label,
    sections: [
      { label: "状态", content: `${kindLabel(job.kind)} · ${statusLabel(job.status)}` },
      { label: "输出", content: output },
    ],
    presentation: output.length > 2_000 || lines > 16 ? "panel" : "modal",
    ...(job.kind === "shell" ? { terminal: "bash" as const } : {}),
  });
  open.value = false;
}

function openSchedule(schedule: SessionJobSchedule): void {
  const content = schedule.prompt;
  emit("detail", {
    title: schedule.label,
    sections: [
      { label: "下次执行", content: formatTime(schedule.nextRunAt) },
      { label: "任务内容", content },
    ],
    presentation: content.length > 2_000 || content.split(/\r?\n/).length > 16 ? "panel" : "modal",
  });
  open.value = false;
}

async function send(id: string): Promise<void> {
  const input = inputs[id]?.trim();
  if (!input) return;
  await sendSessionJobInput(props.sessionId, id, input);
  inputs[id] = "";
  await refresh();
}

async function cancel(id: string): Promise<void> {
  await cancelSessionJob(props.sessionId, id);
  await refresh();
}

function statusLabel(status: JobStatus): string {
  return {
    queued: "排队中",
    running: "运行中",
    waiting: "等待中",
    succeeded: "已完成",
    failed: "失败",
    cancelled: "已取消",
    interrupted: "已中断",
  }[status];
}

function kindLabel(kind: string): string {
  return { shell: "Bash", timer: "定时器", mcp: "MCP", agent_turn: "Agent" }[kind] ?? kind;
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatInterval(value: number): string {
  if (value % 3_600_000 === 0) return `${value / 3_600_000} 小时`;
  if (value % 60_000 === 0) return `${value / 60_000} 分钟`;
  return `${value / 1000} 秒`;
}

function formatDuration(job: SessionJob): string {
  const duration = Math.max(0, (job.finishedAt ?? Date.now()) - (job.startedAt ?? job.createdAt));
  if (duration < 1_000) return "<1秒";
  if (duration < 60_000) return `${Math.floor(duration / 1_000)}秒`;
  return `${Math.floor(duration / 60_000)}分${Math.floor((duration % 60_000) / 1_000)}秒`;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

watch(() => props.sessionId, refresh);
onMounted(() => {
  void refresh();
  poll = setInterval(() => void refresh(), 2_000);
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
});
</script>

<style scoped>
.jobs-popover-wrap {
  position: relative;
}
.jobs-summary {
  border: 1px solid var(--app-border-subtle);
  border-radius: 8px;
}
.jobs-popover {
  position: absolute;
  z-index: 30;
  top: 34px;
  right: 0;
  width: min(440px, calc(100vw - 32px));
  max-height: min(65vh, 560px);
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--app-popup-border);
  border-radius: 10px;
  background: var(--app-popup-bg);
  box-shadow: 0 10px 30px rgb(0 0 0 / 16%);
}
.jobs-popover header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 8px;
}
.jobs-popover header div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.jobs-popover header strong {
  color: var(--app-text-primary);
  font-size: 12px;
}
.jobs-popover header span,
.jobs-popover header button {
  color: var(--app-text-muted);
  font-size: 10px;
}
.jobs-section + .jobs-section {
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px solid var(--app-border-subtle);
}
.jobs-section__title {
  padding: 4px 8px;
  color: var(--app-text-muted);
  font-size: 10px;
  text-transform: uppercase;
}
.job-row + .job-row {
  border-top: 1px solid var(--app-border-subtle);
}
.job-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 7px;
  padding: 8px;
  border-radius: 7px;
  text-align: left;
}
.job-item:hover {
  background: var(--app-hover);
}
.job-item__icon {
  flex: none;
  color: var(--app-accent);
}
.job-item__main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}
.job-item__label {
  overflow: hidden;
  color: var(--app-text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-item__meta {
  color: var(--app-text-muted);
  font-size: 10px;
}
.job-status {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 999px;
  background: var(--app-text-muted);
}
.job-status--running,
.job-status--waiting,
.job-status--queued {
  background: var(--app-accent);
}
.job-status--failed {
  background: #ef4444;
}
.job-status--succeeded {
  background: #22c55e;
}
.job-status--cancelled,
.job-status--interrupted {
  background: #f59e0b;
}
.job-inline-detail {
  padding: 0 8px 9px;
}
.job-inline-detail pre {
  max-height: 180px;
  overflow: auto;
  padding: 9px;
  border-radius: 6px;
  background: var(--app-code-bg);
  color: var(--app-code-text);
  font-family: monospace;
  font-size: 11px;
  white-space: pre-wrap;
}
.job-inline-detail form {
  display: flex;
  gap: 6px;
  margin-top: 7px;
}
.job-inline-detail input {
  min-width: 0;
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--app-border);
  border-radius: 5px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  font-family: monospace;
  font-size: 11px;
  outline: none;
}
.job-inline-detail form button,
.job-cancel {
  padding: 5px 9px;
  border-radius: 5px;
  background: var(--app-hover);
  color: var(--app-text-secondary);
  font-size: 11px;
}
.job-cancel {
  margin-top: 7px;
  color: #dc2626;
}
@media (max-width: 767px) {
  .jobs-popover {
    position: fixed;
    z-index: 90;
    top: auto;
    right: 10px;
    bottom: calc(74px + env(safe-area-inset-bottom));
    left: 10px;
    width: auto;
    max-height: min(62vh, 520px);
  }
}
</style>
