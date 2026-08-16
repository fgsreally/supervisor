<template>
  <div class="plan-confirm">
    <header class="plan-confirm__header">
      <div>
        <h2>{{ t("home.plan.title") }}</h2>
        <p>
          {{ root.title }}
          <span v-if="rootProjectName"> · {{ rootProjectName }}</span>
        </p>
      </div>
      <div class="plan-confirm__actions">
        <button type="button" class="plan-confirm__ghost" :disabled="busy" @click="emit('close')">
          {{ t("home.plan.back") }}
        </button>
        <UiActionButton :loading="confirming" :disabled="busy || !drafts.length" @click="onConfirm">
          {{ t("home.plan.confirm") }}
        </UiActionButton>
      </div>
    </header>

    <div class="plan-confirm__body custom-scrollbar">
      <p class="plan-confirm__hint">
        {{ t("home.plan.hint") }}
      </p>

      <article v-for="(item, index) in drafts" :key="item.id" class="plan-item">
        <header>
          <strong>{{ index + 1 }}. {{ item.title }}</strong>
          <span class="plan-item__parallel">{{ parallelLabel(item) }}</span>
        </header>

        <label>
          <span>{{ t("home.plan.command") }}</span>
          <textarea v-model="item.description" rows="3" />
        </label>

        <div class="plan-item__grid">
          <label>
            <span>{{ t("home.plan.project") }}</span>
            <select v-model.number="item.projectId">
              <option :value="null">{{ t("home.plan.unbound") }}</option>
              <option v-for="project in projects" :key="project.id" :value="Number(project.id)">
                {{ project.name }}
              </option>
            </select>
          </label>

          <label>
            <span>Agent</span>
            <select v-model.number="item.agentId">
              <option :value="null">{{ t("home.plan.defaultAgent") }}</option>
              <option v-for="agent in agents" :key="agent.id" :value="Number(agent.id)">
                {{ agent.name }}
              </option>
            </select>
          </label>
        </div>

        <label>
          <span>{{ t("home.plan.dependencies") }}</span>
          <div class="plan-item__deps">
            <label v-for="other in drafts.filter((row) => row.id !== item.id)" :key="other.id">
              <input
                type="checkbox"
                :checked="item.dependsOn.includes(other.id)"
                @change="toggleDep(item, other.id, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ other.title }}</span>
            </label>
            <span v-if="drafts.length <= 1" class="plan-item__muted">{{ t("home.plan.noOtherTasks") }}</span>
          </div>
        </label>

        <label>
          <span>{{ t("home.plan.subagents") }}</span>
          <div class="plan-item__deps">
            <label v-for="agent in agents" :key="`sub-${item.id}-${agent.id}`">
              <input
                type="checkbox"
                :checked="item.subagentIds.includes(Number(agent.id))"
                @change="
                  toggleSubagent(
                    item,
                    Number(agent.id),
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
              <span>{{ agent.name }}</span>
            </label>
            <span v-if="!agents.length" class="plan-item__muted">{{ t("home.plan.noAgents") }}</span>
          </div>
        </label>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { confirmHomeTask, updateHomeTask, type Agent, type HomeTask, type Project } from "@/api";
import UiActionButton from "@/components/base/UiActionButton.vue";
import { showUiMessage } from "@/composables/use-ui-message";
import { useI18n } from "@/i18n";

interface DraftItem {
  id: number;
  title: string;
  description: string;
  projectId: number | null;
  agentId: number | null;
  dependsOn: number[];
  subagentIds: number[];
}

const props = defineProps<{
  root: HomeTask;
  children: HomeTask[];
  projects: Project[];
  agents: Agent[];
  busy?: boolean;
}>();
const { t } = useI18n();

const emit = defineEmits<{
  close: [];
  confirmed: [payload: { task: HomeTask; children: HomeTask[] }];
}>();

const drafts = ref<DraftItem[]>([]);
const confirming = ref(false);

const rootProjectName = computed(() => {
  if (props.root.projectId == null) return "";
  return props.projects.find((project) => Number(project.id) === props.root.projectId)?.name ?? "";
});

watch(
  () => props.children,
  (children) => {
    drafts.value = children.map((child) => ({
      id: child.id,
      title: child.title,
      description: child.description,
      projectId: child.projectId,
      agentId: child.agentId,
      dependsOn: [...(child.dependsOn ?? [])],
      subagentIds: [...(child.subagentIds ?? [])],
    }));
  },
  { immediate: true, deep: true },
);

function toggleDep(item: DraftItem, depId: number, checked: boolean) {
  if (checked) {
    if (!item.dependsOn.includes(depId)) item.dependsOn = [...item.dependsOn, depId];
  } else {
    item.dependsOn = item.dependsOn.filter((id) => id !== depId);
  }
}

function toggleSubagent(item: DraftItem, agentId: number, checked: boolean) {
  if (checked) {
    if (!item.subagentIds.includes(agentId)) item.subagentIds = [...item.subagentIds, agentId];
  } else {
    item.subagentIds = item.subagentIds.filter((id) => id !== agentId);
  }
}

function parallelLabel(item: DraftItem): string {
  if (item.dependsOn.length === 0) return t("home.plan.parallel");
  const names = item.dependsOn
    .map((id) => drafts.value.find((row) => row.id === id)?.title ?? `#${id}`)
    .join(t("common.listSeparator"));
  return t("home.plan.waiting", { names });
}

async function persistDrafts() {
  for (const item of drafts.value) {
    await updateHomeTask(item.id, {
      description: item.description,
      projectId: item.projectId,
      agentId: item.agentId,
      dependsOn: item.dependsOn,
      subagentIds: item.subagentIds,
    });
  }
}

async function onConfirm() {
  confirming.value = true;
  try {
    await persistDrafts();
    const result = await confirmHomeTask(props.root.id);
    showUiMessage(t("home.plan.confirmed"), "success");
    emit("confirmed", result);
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("home.plan.confirmFailed"), "error");
  } finally {
    confirming.value = false;
  }
}
</script>

<style scoped>
.plan-confirm {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  background: var(--app-settings-card);
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
}
.plan-confirm__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--app-border);
}
.plan-confirm__header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--app-text-primary);
}
.plan-confirm__header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--app-text-muted);
}
.plan-confirm__actions {
  display: flex;
  gap: 8px;
  flex: none;
}
.plan-confirm__ghost {
  padding: 7px 12px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--app-text-secondary);
  background: var(--app-hover);
}
.plan-confirm__body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 14px 16px 20px;
}
.plan-confirm__hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--app-text-secondary);
}
.plan-item {
  padding: 12px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 8px;
  background: var(--app-settings-bg);
}
.plan-item + .plan-item {
  margin-top: 10px;
}
.plan-item header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.plan-item header strong {
  font-size: 13px;
  color: var(--app-text-primary);
}
.plan-item__parallel {
  font-size: 11px;
  color: var(--app-text-muted);
}
.plan-item label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--app-text-secondary);
}
.plan-item textarea,
.plan-item select {
  width: 100%;
  padding: 7px 8px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  font-size: 12px;
}
.plan-item__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.plan-item__deps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 8px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 6px;
  background: var(--app-settings-card);
}
.plan-item__deps label {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: var(--app-text-primary);
}
.plan-item__muted {
  font-size: 11px;
  color: var(--app-text-muted);
}
@media (max-width: 720px) {
  .plan-item__grid {
    grid-template-columns: 1fr;
  }
  .plan-confirm__header {
    flex-direction: column;
  }
}
</style>
