<template>
  <ChatHeaderPopover v-if="timers.length" :open="open" @update:open="open = $event" :title="t('jobs.schedules')" panel-class="jobs-popover" :dismiss-on-outside="dismissOnOutside" :count="timers.length">
    <template #icon><Clock3 /></template>
    <template #header>
      <strong>{{ t("jobs.schedules") }}</strong>
      <button type="button" :title="t('jobs.refresh')" @click="refresh"><RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" /></button>
    </template>
    <template #mobile-header>
      <span>{{ t("jobs.schedules") }}</span>
      <button type="button" :title="t('jobs.refresh')" @click="refresh"><RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" /></button>
    </template>
    <template #default>
      <div class="jobs-section">
        <button v-for="timer in timers" :key="timer.id" class="job-item" type="button" @click="openTimer(timer)">
          <Clock3 class="job-item__icon h-3.5 w-3.5" />
          <span class="job-item__main">
            <span class="job-item__label">{{ timer.label }}</span>
            <span class="job-item__meta">{{ formatTime(timer.nextRunAt) }}<template v-if="timer.intervalMs"> · {{ t("jobs.every", { value: formatInterval(timer.intervalMs) }) }}</template></span>
          </span>
          <ChevronRight class="h-3.5 w-3.5" />
        </button>
      </div>
    </template>
  </ChatHeaderPopover>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChevronRight, Clock3, RefreshCw } from "lucide-vue-next";
import { getSessionTimers, type SessionTimer } from "@/api";
import { useI18n } from "@/i18n";
import ChatHeaderPopover from "./ChatHeaderPopover.vue";

export interface JobDetailRequest {
  title: string;
  sections: Array<{ label: string; content: string }>;
  presentation: "modal" | "panel";
  terminal?: "bash";
  jobId?: string;
}

const props = withDefaults(defineProps<{ sessionId: string; dismissOnOutside?: boolean }>(), { dismissOnOutside: true });
const emit = defineEmits<{ detail: [request: JobDetailRequest] }>();
const { t } = useI18n();
const timers = ref<SessionTimer[]>([]);
const open = ref(false);
const loading = ref(false);
let poll: ReturnType<typeof setTimeout> | undefined;

async function refresh() {
  loading.value = true;
  try {
    timers.value = (await getSessionTimers(props.sessionId)).timers;
    if (!timers.value.length) open.value = false;
  } catch {
    timers.value = [];
  } finally {
    loading.value = false;
  }
}
function openTimer(timer: SessionTimer) {
  emit("detail", { title: timer.label, sections: [{ label: t("jobs.prompt"), content: timer.prompt }], presentation: timer.prompt.length > 2000 ? "panel" : "modal" });
  open.value = false;
}
function formatTime(value: number): string { return new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value); }
function formatInterval(value: number): string {
  if (value % 3_600_000 === 0) return t("jobs.hours", { count: value / 3_600_000 });
  if (value % 60_000 === 0) return t("jobs.minutes", { count: value / 60_000 });
  return t("jobs.seconds", { count: value / 1000 });
}
function schedule() { if (poll) clearTimeout(poll); poll = setTimeout(() => { void refresh().finally(schedule); }, 60_000); }
watch(() => props.sessionId, () => void refresh().finally(schedule));
onMounted(() => void refresh().finally(schedule));
onBeforeUnmount(() => { if (poll) clearTimeout(poll); });
</script>

<style scoped>
:deep(.jobs-popover) { position: absolute; z-index: 30; top: 34px; right: 0; width: min(440px, calc(100vw - 32px)); max-height: min(65vh, 560px); overflow-y: auto; padding: 6px; border: 1px solid var(--app-popup-border); border-radius: 10px; background: var(--app-popup-bg); box-shadow: 0 10px 30px rgb(0 0 0 / 16%); }
:deep(.jobs-popover) > header { display: flex; align-items: center; justify-content: space-between; padding: 7px 8px; }
.jobs-section { padding: 4px; }
.job-item { display: flex; width: 100%; align-items: center; gap: 7px; padding: 8px; border-radius: 7px; text-align: left; }
.job-item:hover { background: var(--app-hover); }
.job-item__icon { flex: none; color: var(--app-accent); }
.job-item__main { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 2px; }
.job-item__label { overflow: hidden; color: var(--app-text-primary); font-size: var(--app-font-control); text-overflow: ellipsis; white-space: nowrap; }
.job-item__meta { color: var(--app-text-muted); font-size: var(--app-font-micro); }
</style>
