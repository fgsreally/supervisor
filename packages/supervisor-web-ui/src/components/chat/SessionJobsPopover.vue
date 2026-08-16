<template>
  <ChatHeaderPopover
    v-if="totalCount"
    :open="open"
    @update:open="open = $event"
    :title="summaryTitle"
    panel-class="jobs-popover"
    :dismiss-on-outside="dismissOnOutside"
    :count="totalCount"
  >
    <template #icon><Activity /></template>

    <template #header>
        <div>
          <strong>{{ t("jobs.title") }}</strong>
          <span v-if="activeCount">{{ t("jobs.activeCount", { count: activeCount }) }}</span>
        </div>
        <button type="button" :title="t('jobs.refresh')" @click="refresh">
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
        </button>
    </template>
    <template #mobile-header>
        <span v-if="activeCount">{{ t("jobs.activeCount", { count: activeCount }) }}</span>
        <span v-else>{{ t("jobs.history") }}</span>
        <button type="button" :title="t('jobs.refresh')" @click="refresh">
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
        </button>
    </template>
    <template #default>

      <div v-if="schedules.length" class="jobs-section">
        <div class="jobs-section__title">{{ t("jobs.schedules") }}</div>
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
                · {{ t("jobs.every", { value: formatInterval(schedule.intervalMs) }) }}
              </template>
              <template v-else>· {{ t("jobs.once") }}</template>
            </span>
          </span>
          <ChevronRight class="h-3.5 w-3.5" />
        </button>
      </div>

      <div v-if="jobs.length" class="jobs-section">
        <div class="jobs-section__title">{{ t("jobs.history") }}</div>
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
            <pre>{{ job.output || formatValue(job.result ?? job.error) || t("jobs.noOutput") }}</pre>
            <form
              v-if="job.capabilities.includes('input') && job.status === 'running'"
              @submit.prevent="send(job.id)"
            >
              <input v-model="inputs[job.id]" type="text" :placeholder="t('jobs.stdinPlaceholder')" />
              <button type="submit" :disabled="!inputs[job.id]?.trim()">{{ t("jobs.send") }}</button>
            </form>
            <button
              v-if="job.capabilities.includes('cancel') && isActive(job.status)"
              class="job-cancel"
              type="button"
              @click="cancel(job.id)"
            >
              {{ t("jobs.cancel") }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </ChatHeaderPopover>
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
import { useI18n } from "@/i18n";
import ChatHeaderPopover from "./ChatHeaderPopover.vue";

export interface JobDetailRequest {
  title: string;
  sections: Array<{ label: string; content: string }>;
  presentation: "modal" | "panel";
  terminal?: "bash";
  jobId?: string;
}

const props = withDefaults(defineProps<{ sessionId: string; dismissOnOutside?: boolean }>(), {
  dismissOnOutside: true,
});
const { t } = useI18n();
const emit = defineEmits<{ detail: [request: JobDetailRequest] }>();
const jobs = ref<SessionJob[]>([]);
const schedules = ref<SessionJobSchedule[]>([]);
const open = ref(false);
const loading = ref(false);
const expandedId = ref<string>();
const inputs = reactive<Record<string, string>>({});
let poll: ReturnType<typeof setTimeout> | undefined;

const visibleJobs = computed(() => {
  const attention = jobs.value.filter((job) => isAttentionJob(job));
  const ranked = [...attention].sort((left, right) => {
    const leftActive = isActive(left.status) ? 0 : 1;
    const rightActive = isActive(right.status) ? 0 : 1;
    if (leftActive !== rightActive) return leftActive - rightActive;
    return (right.startedAt ?? right.createdAt) - (left.startedAt ?? left.createdAt);
  });
  return ranked.slice(0, 12);
});
const activeCount = computed(
  () => jobs.value.filter((job) => isAttentionJob(job) && isActive(job.status)).length,
);
const totalCount = computed(() => schedules.value.length + visibleJobs.value.length);
const summaryTitle = computed(() => {
  const parts = [t("jobs.totalCount", { count: totalCount.value })];
  if (activeCount.value) parts.push(t("jobs.activeCount", { count: activeCount.value }));
  if (schedules.value.length) parts.push(t("jobs.scheduleCount", { count: schedules.value.length }));
  return parts.join(" · ");
});

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const snapshot = await getSessionJobs(props.sessionId);
    jobs.value = snapshot.jobs;
    schedules.value = snapshot.schedules;
    const attention = snapshot.jobs.filter(isAttentionJob).length;
    if (attention + snapshot.schedules.length === 0) open.value = false;
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

/** Jobs tray is for things the user should notice (timers, etc.), not Vite/runtime logs. */
function isAttentionJob(job: SessionJob): boolean {
  if (job.kind === "project-service") return false;
  if (job.kind === "shell") return job.name === "persistent-bash";
  return true;
}

function openJob(job: SessionJob): void {
  const output = job.output || formatValue(job.result ?? job.error) || t("jobs.noOutput");
  const lines = output.split(/\r?\n/).length;
  if (output.length <= 600 && lines <= 6) {
    expandedId.value = expandedId.value === job.id ? undefined : job.id;
    return;
  }
  emit("detail", {
    title: job.label,
    sections: [
      { label: t("jobs.status"), content: `${kindLabel(job.kind)} · ${statusLabel(job.status)}` },
      { label: t("jobs.output"), content: output },
    ],
    presentation: output.length > 2_000 || lines > 16 ? "panel" : "modal",
    ...(job.kind === "shell" || job.kind === "project-service"
      ? { terminal: "bash" as const, jobId: job.id }
      : {}),
  });
  open.value = false;
}

function openSchedule(schedule: SessionJobSchedule): void {
  const content = schedule.prompt;
  emit("detail", {
    title: schedule.label,
    sections: [
      { label: t("jobs.nextRun"), content: formatTime(schedule.nextRunAt) },
      { label: t("jobs.prompt"), content },
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
    queued: t("jobs.queued"),
    running: t("jobs.running"),
    waiting: t("jobs.waiting"),
    succeeded: t("jobs.succeeded"),
    failed: t("jobs.failed"),
    cancelled: t("jobs.cancelled"),
    interrupted: t("jobs.interrupted"),
  }[status];
}

function kindLabel(kind: string): string {
  return { shell: "Bash", timer: t("jobs.timer"), mcp: "MCP", agent_turn: "Agent" }[kind] ?? kind;
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
  if (value % 3_600_000 === 0) return t("jobs.hours", { count: value / 3_600_000 });
  if (value % 60_000 === 0) return t("jobs.minutes", { count: value / 60_000 });
  return t("jobs.seconds", { count: value / 1000 });
}

function formatDuration(job: SessionJob): string {
  const duration = Math.max(0, (job.finishedAt ?? Date.now()) - (job.startedAt ?? job.createdAt));
  if (duration < 1_000) return t("jobs.lessThanSecond");
  if (duration < 60_000) return t("jobs.durationSeconds", { count: Math.floor(duration / 1_000) });
  return t("jobs.durationMinutesSeconds", {
    minutes: Math.floor(duration / 60_000),
    seconds: Math.floor((duration % 60_000) / 1_000),
  });
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function scheduleRefresh(): void {
  if (poll) clearTimeout(poll);
  const delay = open.value || activeCount.value > 0 ? 15_000 : 60_000;
  poll = setTimeout(async () => {
    if (document.visibilityState === "visible") await refresh();
    scheduleRefresh();
  }, delay);
}

function onVisibilityChange(): void {
  if (document.visibilityState !== "visible") return;
  void refresh().finally(scheduleRefresh);
}

watch(
  () => props.sessionId,
  () => void refresh().finally(scheduleRefresh),
);
watch(open, (value) => {
  if (value) void refresh().finally(scheduleRefresh);
});
onMounted(() => {
  document.addEventListener("visibilitychange", onVisibilityChange);
  void refresh().finally(scheduleRefresh);
});
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisibilityChange);
  if (poll) clearTimeout(poll);
});
</script>

<style scoped>
.jobs-sheet-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: -4px 0 8px;
  color: var(--app-text-muted);
  font-size: 13px;
}

.jobs-sheet-toolbar button {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border-radius: 999px;
  color: var(--app-text-secondary);
}

:deep(.jobs-popover) {
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

:deep(.jobs-popover) > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 8px;
}

:deep(.jobs-popover) > header div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

:deep(.jobs-popover) > header strong {
  color: var(--app-text-primary);
  font-size: 12px;
}

:deep(.jobs-popover) > header span,
:deep(.jobs-popover) > header button {
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
  .job-item {
    padding: 12px 8px;
  }

  .job-item__label {
    font-size: 14px;
  }

  .job-item__meta,
  .jobs-section__title {
    font-size: 12px;
  }
}
</style>
