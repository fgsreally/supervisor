<template>
  <div class="bg-bash-panel" :class="{ 'bg-bash-panel--embedded': embedded }">
    <header v-if="!embedded" class="bg-bash-panel__header">
      <span>{{ t("session.background.title") }}{{ count ? ` · ${count}` : "" }}</span>
      <button type="button" :title="t('common.close')" @click="$emit('close')"><X /></button>
    </header>
    <div class="bg-bash-panel__body">
      <SessionBackgroundTerminals
        class="bg-bash-panel__list"
        :session-id="sessionId"
        @open="selectJob"
        @changed="onChanged"
      />
      <div v-if="selectedJobId" class="bg-bash-panel__terminal">
        <ToolDetailPanel
          embedded
          :title="selectedTitle"
          :sections="[{ label: t('session.background.output'), content: t('log.loading') }]"
          terminal="bash"
          :job-id="selectedJobId"
          :session-id="sessionId"
          @close="selectedJobId = null"
          @job-ended="onJobEnded"
        />
      </div>
      <div v-else class="bg-bash-panel__empty">
        {{ count ? t("session.background.select") : t("session.background.empty") }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { getSessionJobs } from "@/api";
import SessionBackgroundTerminals from "./SessionBackgroundTerminals.vue";
import ToolDetailPanel from "../tool/ToolDetailPanel.vue";
import { useI18n } from "@/i18n";

const props = defineProps<{
  sessionId: string;
  embedded?: boolean;
  /** Prefill selection when opening from chat tool card. */
  initialJobId?: string;
}>();
const { t } = useI18n();

defineEmits<{ close: [] }>();

const selectedJobId = ref<string | null>(props.initialJobId ?? null);
const selectedTitle = ref("");
const count = ref(0);

const hasSelection = computed(() => Boolean(selectedJobId.value));
void hasSelection;

async function selectJob(jobId: string) {
  selectedJobId.value = jobId;
  const snapshot = await getSessionJobs(props.sessionId).catch(() => undefined);
  const job = snapshot?.jobs.find((item) => item.id === jobId);
  const command =
    typeof job?.metadata.resolvedCommand === "string"
      ? job.metadata.resolvedCommand
      : typeof job?.metadata.command === "string"
        ? job.metadata.command
        : "";
  selectedTitle.value = command || job?.label || t("session.background.title");
}

function onJobEnded(jobId: string) {
  if (selectedJobId.value === jobId) selectedJobId.value = null;
}

function onChanged() {
  void refreshCount();
}

async function refreshCount() {
  const sessionId = props.sessionId;
  const snapshot = await getSessionJobs(sessionId).catch(() => undefined);
  if (props.sessionId !== sessionId) return;
  if (!snapshot) {
    count.value = 0;
    return;
  }
  count.value = snapshot.jobs.filter(
    (job) =>
      (job.status === "running" || job.status === "waiting" || job.status === "queued") &&
      (job.kind === "shell" ||
        (job.kind === "project-service" && (job.name || "").startsWith("start:"))),
  ).length;
}

watch(
  () => props.initialJobId,
  (id) => {
    if (id) void selectJob(id);
  },
  { immediate: true },
);

watch(
  () => props.sessionId,
  () => {
    selectedJobId.value = props.initialJobId ?? null;
    void refreshCount();
  },
  { immediate: true },
);
</script>

<style scoped>
.bg-bash-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--app-chat-bg);
}
.bg-bash-panel--embedded {
  width: 100%;
}
.bg-bash-panel__header {
  height: 48px;
  flex: none;
  padding: 0 12px 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--app-border-subtle);
  color: var(--app-text-primary);
  font-size: var(--app-font-body-strong);
  font-weight: var(--app-font-weight-medium);
}
.bg-bash-panel__header button {
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 0.35rem;
  color: var(--app-text-muted);
}
.bg-bash-panel__header button:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}
.bg-bash-panel__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.bg-bash-panel__list {
  flex: none;
  max-height: 40%;
  overflow: auto;
  border-bottom: 1px solid var(--app-border-subtle);
}
.bg-bash-panel__terminal {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.bg-bash-panel__terminal :deep(.tool-detail-panel) {
  width: 100%;
  min-width: 0;
  border-left: 0;
}
.bg-bash-panel__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--app-text-muted);
  font-size: var(--app-font-body);
}
</style>
