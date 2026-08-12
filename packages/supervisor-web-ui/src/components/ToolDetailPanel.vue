<template>
  <aside class="tool-detail-panel" :class="{ 'tool-detail-panel--embedded': embedded }">
    <div v-if="!mobile && !embedded" class="tool-detail-panel__grabber" />
    <header v-if="!mobile && !embedded">
      <span>{{ title }}</span>
      <div class="tool-detail-panel__actions">
        <button
          v-if="canKillJob"
          type="button"
          class="tool-detail-panel__kill"
          :disabled="killing"
          title="结束此后台进程"
          @click="killJob"
        >
          {{ killing ? "结束中…" : "结束" }}
        </button>
        <button type="button" title="关闭" @click="$emit('close')"><X /></button>
      </div>
    </header>
    <div v-else-if="canKillJob" class="tool-detail-panel__toolbar">
      <span class="tool-detail-panel__toolbar-label">{{ title }}</span>
      <button
        type="button"
        class="tool-detail-panel__kill"
        :disabled="killing"
        title="结束此后台进程"
        @click="killJob"
      >
        {{ killing ? "结束中…" : "结束" }}
      </button>
    </div>
    <ToolTerminal v-if="terminal" :lines="terminalLines" :prompt="terminalPrompt" />
    <div v-else class="tool-detail-panel__body custom-scrollbar">
      <section v-for="(section, index) in sections" :key="index">
        <label>{{ section.label }}</label>
        <MarkdownContent v-if="section.markdown" :content="section.content" />
        <pre v-else>{{ section.content }}</pre>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  cancelSessionJob,
  getSessionEvalState,
  getSessionJobs,
  type EvalRuntimeState,
  type SessionJob,
} from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import { useSessionStore } from "@/store";
import MarkdownContent from "./MarkdownContent.vue";
import ToolTerminal from "./ToolTerminal.vue";
import type { ToolDetailSection } from "./ToolDetailModal.vue";

const props = defineProps<{
  title: string;
  sections: ToolDetailSection[];
  /** Eval surface: kernel history and/or a background bash Job. */
  terminal?: "bash" | "eval";
  /** Live-poll this Job's output (background bash / project-service). */
  jobId?: string;
  sessionId?: string;
  mobile?: boolean;
  /** PC tab host: hide standalone header/close chrome. */
  embedded?: boolean;
}>();
const emit = defineEmits<{
  close: [];
  /** Background job reached a terminal status — host should dismiss the tab. */
  "job-ended": [jobId: string];
}>();
const evalState = ref<EvalRuntimeState>();
const jobState = ref<SessionJob>();
const killing = ref(false);
const sessionStore = useSessionStore();
let evalSignature = "";
let jobSignature = "";
let endedEmittedFor = "";
let closeTimer: ReturnType<typeof setTimeout> | undefined;

const watchingJob = computed(() => Boolean(props.jobId));
const canKillJob = computed(() => {
  if (!props.jobId || !props.sessionId) return false;
  const status = jobState.value?.status;
  return status === "running" || status === "waiting" || status === "queued";
});

const terminalLines = computed(() => {
  if (watchingJob.value && jobState.value) {
    const job = jobState.value;
    const metaCommand = typeof job.metadata.command === "string" ? job.metadata.command : "";
    const header = metaCommand
      ? `\x1b[36m$ ${metaCommand}\x1b[0m`
      : `\x1b[36m# ${job.label}\x1b[0m`;
    const status = `\x1b[90m# ${job.kind} · ${job.status}\x1b[0m`;
    const body = job.output || "(暂无输出)";
    return [header, status, body];
  }
  if (props.terminal === "eval" && evalState.value?.history.length) {
    return evalState.value.history.flatMap((entry) => [
      `\x1b[36m[${entry.language}]\x1b[0m ${entry.code}`,
      entry.output,
    ]);
  }
  return props.sections.flatMap((section) => [
    `\x1b[90m# ${section.label}\x1b[0m`,
    section.content,
  ]);
});
const terminalPrompt = computed(() => {
  if (watchingJob.value) {
    return jobState.value?.status === "running" || jobState.value?.status === "waiting"
      ? "$ running…"
      : "$ output complete";
  }
  if (props.terminal === "eval") return ">>> kernel ready";
  return "$ output complete";
});

function isTerminalJobStatus(status: string | undefined): boolean {
  return (
    status === "completed" ||
    status === "succeeded" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "interrupted" ||
    status === "error"
  );
}

function maybeEmitJobEnded(job: SessionJob) {
  if (!props.jobId || !isTerminalJobStatus(job.status)) return;
  if (endedEmittedFor === props.jobId) return;
  endedEmittedFor = props.jobId;
  if (closeTimer) clearTimeout(closeTimer);
  // Brief pause so the final lines are visible, then dismiss (npm i etc.).
  closeTimer = setTimeout(() => {
    emit("job-ended", props.jobId!);
  }, 1200);
}

async function killJob() {
  if (!props.sessionId || !props.jobId || killing.value) return;
  killing.value = true;
  try {
    const { job } = await cancelSessionJob(props.sessionId, props.jobId);
    jobState.value = job;
    jobSignature = `${job.status}:${job.output.length}:${job.finishedAt ?? 0}`;
    // Server clears meta.services.jobId/pid on terminal; refresh local session row.
    void sessionStore.fetchSession(props.sessionId);
    showUiMessage("已结束后台进程", "success");
    maybeEmitJobEnded(job);
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "结束失败", "error");
  } finally {
    killing.value = false;
  }
}

let poll: ReturnType<typeof setInterval> | undefined;
async function refreshEvalState() {
  if (watchingJob.value || props.terminal !== "eval" || !props.sessionId || document.hidden) {
    return;
  }
  const next = await getSessionEvalState(props.sessionId).catch(() => undefined);
  if (!next) return;
  const signature = JSON.stringify(next.history);
  if (signature === evalSignature) return;
  evalSignature = signature;
  evalState.value = next;
}
async function refreshJobState() {
  if (!props.jobId || !props.sessionId || document.hidden) return;
  const snapshot = await getSessionJobs(props.sessionId).catch(() => undefined);
  const next = snapshot?.jobs.find((job) => job.id === props.jobId);
  if (!next) {
    // Job row gone (CASCADE / restart) — treat as ended.
    if (endedEmittedFor !== props.jobId) {
      endedEmittedFor = props.jobId;
      emit("job-ended", props.jobId);
    }
    return;
  }
  const signature = `${next.status}:${next.output.length}:${next.finishedAt ?? 0}`;
  if (signature === jobSignature) return;
  jobSignature = signature;
  jobState.value = next;
  maybeEmitJobEnded(next);
}
function startPolling() {
  if (poll) clearInterval(poll);
  poll = undefined;
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = undefined;
  }
  endedEmittedFor = "";
  killing.value = false;
  if (props.jobId) {
    void refreshJobState();
    poll = setInterval(refreshJobState, 1500);
  } else if (props.terminal === "eval") {
    void refreshEvalState();
    poll = setInterval(refreshEvalState, 3000);
  }
}
onMounted(() => startPolling());
watch(
  () => [props.terminal, props.jobId, props.sessionId] as const,
  () => {
    evalSignature = "";
    jobSignature = "";
    startPolling();
  },
);
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  if (closeTimer) clearTimeout(closeTimer);
});
</script>

<style scoped>
.tool-detail-panel {
  width: min(48%, 44rem);
  min-width: 22rem;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--app-border-subtle);
  background: var(--app-chat-bg);
}
.tool-detail-panel--embedded {
  width: 100%;
  min-width: 0;
  border-left: 0;
}
header {
  height: 48px;
  flex: none;
  padding: 0 12px 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--app-border-subtle);
  color: var(--app-text-primary);
}
header span {
  font-size: var(--app-font-body-strong);
  font-weight: var(--app-font-weight-medium);
}
.tool-detail-panel__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tool-detail-panel__toolbar {
  flex: none;
  height: 40px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.tool-detail-panel__toolbar-label {
  font-size: var(--app-font-control);
  font-weight: var(--app-font-weight-medium);
  color: var(--app-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tool-detail-panel__kill {
  cursor: pointer;
  padding: 0.3rem 0.65rem;
  border-radius: 0.35rem;
  font-size: var(--app-font-control);
  font-weight: var(--app-font-weight-medium);
  color: var(--app-danger, #c44);
  border: 1px solid color-mix(in srgb, var(--app-danger, #c44) 35%, transparent);
  background: transparent;
}
.tool-detail-panel__kill:hover:not(:disabled) {
  background: color-mix(in srgb, var(--app-danger, #c44) 12%, transparent);
}
.tool-detail-panel__kill:disabled {
  opacity: 0.55;
  cursor: default;
}
header button:not(.tool-detail-panel__kill) {
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 0.35rem;
  color: var(--app-text-muted);
}
header button:not(.tool-detail-panel__kill):hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}
header svg {
  width: 1.1rem;
  height: 1.1rem;
}
.tool-detail-panel__grabber {
  display: none;
}
.tool-detail-panel__body {
  overflow: auto;
  flex: 1;
  padding: 12px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
section label {
  display: block;
  margin-bottom: 6px;
  font-size: var(--app-font-caption);
  font-weight: var(--app-font-weight-medium);
  color: var(--app-text-muted);
}
section pre {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--app-code-bg, var(--app-hover));
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--app-font-caption);
  line-height: 1.45;
}
@media (max-width: 767px) {
  .tool-detail-panel {
    width: 100%;
    min-width: 0;
    border-left: 0;
  }
}
</style>
