<template>
  <div v-if="terminals.length" class="bg-terminals">
    <button
      type="button"
      class="bg-terminals__summary"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <ChevronRight
        class="bg-terminals__chevron"
        :class="{ 'bg-terminals__chevron--open': expanded }"
      />
      <span>{{ terminals.length }} 个后台终端</span>
    </button>
    <ul v-if="expanded" class="bg-terminals__list">
      <li v-for="job in terminals" :key="job.id" class="bg-terminals__item">
        <button
          type="button"
          class="bg-terminals__open"
          :title="jobCommand(job)"
          @click="$emit('open', job.id)"
        >
          <span class="bg-terminals__dot" :data-status="job.status" />
          <span class="bg-terminals__label">{{ jobLabel(job) }}</span>
        </button>
        <button
          v-if="canCancel(job)"
          type="button"
          class="bg-terminals__kill"
          title="结束"
          :disabled="killingId === job.id"
          @click.stop="kill(job.id)"
        >
          结束
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { cancelSessionJob, getSessionJobs, type SessionJob } from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import { useSessionStore } from "@/store";

const props = defineProps<{
  sessionId: string;
}>();

const emit = defineEmits<{
  open: [jobId: string];
  changed: [];
}>();

const terminals = ref<SessionJob[]>([]);
const expanded = ref(true);
const killingId = ref<string | null>(null);
const sessionStore = useSessionStore();
let poll: ReturnType<typeof setInterval> | undefined;

function isBackgroundKind(job: SessionJob): boolean {
  if (job.kind === "shell") return true;
  return job.kind === "project-service" && (job.name || "").startsWith("start:");
}

function isLive(job: SessionJob): boolean {
  return job.status === "running" || job.status === "waiting" || job.status === "queued";
}

function jobCommand(job: SessionJob): string {
  const command =
    typeof job.metadata.resolvedCommand === "string"
      ? job.metadata.resolvedCommand.trim()
      : typeof job.metadata.command === "string"
        ? job.metadata.command.trim()
        : "";
  return command || job.label || job.name;
}

function jobLabel(job: SessionJob): string {
  const command = jobCommand(job);
  if (command.length <= 42) return command;
  return `${command.slice(0, 40)}…`;
}

function canCancel(job: SessionJob): boolean {
  return isLive(job) && job.capabilities.includes("cancel");
}

async function refresh() {
  if (!props.sessionId || document.hidden) return;
  const snapshot = await getSessionJobs(props.sessionId).catch(() => undefined);
  if (!snapshot) return;
  const next = snapshot.jobs.filter((job) => isBackgroundKind(job) && isLive(job));
  const prevIds = terminals.value.map((job) => job.id).join(",");
  const nextIds = next.map((job) => job.id).join(",");
  terminals.value = next;
  if (prevIds !== nextIds) emit("changed");
}

async function kill(jobId: string) {
  if (killingId.value) return;
  killingId.value = jobId;
  try {
    await cancelSessionJob(props.sessionId, jobId);
    void sessionStore.fetchSession(props.sessionId);
    showUiMessage("已结束后台进程", "success");
    await refresh();
    emit("changed");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "结束失败", "error");
  } finally {
    killingId.value = null;
  }
}

function startPolling() {
  if (poll) clearInterval(poll);
  void refresh();
  poll = setInterval(() => void refresh(), 2000);
}

onMounted(() => startPolling());
watch(
  () => props.sessionId,
  () => startPolling(),
);
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
});
</script>

<style scoped>
.bg-terminals {
  flex: none;
  border-bottom: 1px solid var(--app-border-subtle);
}
.bg-terminals__summary {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--app-text-muted);
  font-size: var(--app-font-caption);
  font-weight: var(--app-font-weight-medium);
  text-align: left;
  cursor: pointer;
}
.bg-terminals__summary:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}
.bg-terminals__chevron {
  width: 0.875rem;
  height: 0.875rem;
  flex: none;
  transition: transform 0.12s ease;
}
.bg-terminals__chevron--open {
  transform: rotate(90deg);
}
.bg-terminals__list {
  margin: 0;
  padding: 0 6px 8px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bg-terminals__item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.bg-terminals__open {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-primary);
  font-size: var(--app-font-caption);
  text-align: left;
  cursor: pointer;
}
.bg-terminals__open:hover {
  background: var(--app-hover);
}
.bg-terminals__dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--app-status-running, #07c160);
}
.bg-terminals__dot[data-status="waiting"],
.bg-terminals__dot[data-status="queued"] {
  background: var(--app-text-muted);
}
.bg-terminals__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bg-terminals__kill {
  flex: none;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--app-danger, #c44) 35%, transparent);
  border-radius: 6px;
  background: transparent;
  color: var(--app-danger, #c44);
  font-size: var(--app-font-micro);
  font-weight: var(--app-font-weight-medium);
  cursor: pointer;
}
.bg-terminals__kill:hover:not(:disabled) {
  background: color-mix(in srgb, var(--app-danger, #c44) 12%, transparent);
}
.bg-terminals__kill:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>
