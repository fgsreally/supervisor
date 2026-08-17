<template>
  <ResponsiveDialog
    :open="open"
    :title="t('session.agentPicker.title')"
    :description="t('session.agentPicker.description')"
    width="sm"
    size="auto"
    :show-close="false"
    panel-class="agent-picker-dialog"
    @close="emit('close')"
  >
    <template #header-actions>
      <button type="button" :title="t('session.agentPicker.redetect')" :disabled="detecting" @click="detectAgents">
        <RefreshCw :class="{ 'animate-spin': detecting }" />
      </button>
    </template>

    <div class="agent-picker custom-scrollbar">
      <div v-if="project" class="agent-picker__project">
        <div class="agent-picker__project-icon">
          <FolderOpen class="w-4 h-4" />
        </div>
        <div class="agent-picker__project-text min-w-0">
          <div class="agent-picker__project-name truncate">{{ project.name }}</div>
          <div class="agent-picker__project-cwd truncate">{{ project.cwd }}</div>
        </div>
      </div>

      <div class="agent-picker__groups">
        <section v-for="group in groups" :key="group.label" class="agent-picker__group">
          <div class="agent-picker__section-label">{{ group.label }}</div>
          <div class="agent-picker__card">
            <button
              v-for="agent in group.agents"
              :key="agent.id"
              type="button"
              class="agent-picker__row"
              :class="{ 'agent-picker__row--disabled': !agent.available }"
              :disabled="!agent.available"
              @click="agent.available && emit('select', agent.id)"
            >
              <AgentAvatar
                :agent-id="agent.id"
                :agent-name="agent.name"
                :icon="agent.avatar"
                class="agent-picker__avatar !rounded-full w-10 h-10 text-sm"
              />
              <div class="min-w-0 flex-1">
                <div class="agent-picker__name">{{ agent.name }}</div>
                <div
                  class="agent-picker__desc"
                  :class="{ 'agent-picker__desc--error': !agent.available }"
                >
                  {{ agent.available ? agent.description : agent.unavailableReason }}
                </div>
              </div>
            </button>
          </div>
        </section>
      </div>

      <div v-if="!groups.length" class="agent-picker__empty">{{ t("session.agentPicker.empty") }}</div>
      <p v-else class="agent-picker__hint">{{ t("session.agentPicker.hint") }}</p>
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { FolderOpen, RefreshCw } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import type { Project } from "@/api";
import { useAgentStore } from "@/store";
import ResponsiveDialog from "@/components/base/ResponsiveDialog/index.vue";
import AgentAvatar from "../agent/AgentAvatar.vue";

const props = defineProps<{
  open: boolean;
  projectId: string | null;
  projects: Project[];
}>();

const emit = defineEmits<{
  close: [];
  select: [agentId: string];
}>();

const agentStore = useAgentStore();
const { t } = useI18n();
/** 与「智能代理」Tab 共用同一套分类/可见性规则 */
const groups = computed(() => agentStore.getAgentsByCategory);
const detecting = ref(false);

const project = computed(() =>
  props.projectId ? props.projects.find((item) => item.id === props.projectId) : undefined,
);

watch(
  () => props.open,
  (open) => {
    if (open) void detectAgents();
  },
);

async function detectAgents() {
  detecting.value = true;
  try {
    await agentStore.detectExternalAgents();
  } finally {
    detecting.value = false;
  }
}
</script>

<style scoped>
.agent-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(64vh, 520px);
  overflow-y: auto;
  scrollbar-width: none;
  padding: 2px 0 8px;
}

.agent-picker::-webkit-scrollbar {
  display: none;
}

.agent-picker__project {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-list-search-bg, var(--app-hover)) 70%, transparent);
}

.agent-picker__project-icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  color: var(--app-text-secondary);
  background: var(--app-popup-bg, var(--app-settings-card));
  border: 1px solid var(--app-border-subtle);
}

.agent-picker__project-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-primary);
  line-height: 1.3;
}

.agent-picker__project-cwd {
  margin-top: 2px;
  font-size: 11px;
  color: var(--app-text-muted);
  line-height: 1.3;
}

.agent-picker__groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-picker__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-picker__section-label {
  padding: 0 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}

.agent-picker__card {
  overflow: hidden;
  border: 1px solid var(--app-border-subtle);
  border-radius: 10px;
  background: var(--app-settings-card, var(--app-popup-bg));
}

.agent-picker__row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  text-align: left;
  background: transparent;
  border-bottom: 1px solid var(--app-divider);
  transition:
    background-color 0.12s ease,
    box-shadow 0.12s ease;
}

.agent-picker__row:last-child {
  border-bottom: none;
}

.agent-picker__row:hover:not(:disabled) {
  background: var(--app-popup-hover);
}

.agent-picker__row--disabled {
  cursor: not-allowed;
}

.agent-picker__row--disabled .agent-picker__avatar {
  filter: grayscale(1);
  opacity: 0.62;
}

.agent-picker__row--disabled .agent-picker__name {
  opacity: 0.62;
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.agent-picker__avatar {
  border-radius: 50% !important;
  overflow: hidden;
}

.agent-picker__name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--app-text-primary);
}

.agent-picker__desc {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--app-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-picker__desc--error {
  color: #e54d42;
  white-space: normal;
}

.agent-picker__empty {
  padding: 36px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--app-text-muted);
}

.agent-picker__hint {
  margin: 0;
  padding: 0 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--app-text-muted);
}

/* PC：内容区留白、分组卡片、副文案 */
@media (min-width: 768px) {
  .agent-picker {
    gap: 18px;
    padding: 18px 20px 20px;
    max-height: min(68vh, 560px);
  }

  .agent-picker__groups {
    gap: 18px;
  }

  .agent-picker__group {
    gap: 8px;
  }

  .agent-picker__project {
    padding: 12px 14px;
    border-radius: 12px;
  }

  .agent-picker__card {
    border-radius: 12px;
  }

  .agent-picker__row {
    padding: 12px 14px;
    gap: 14px;
  }

  .agent-picker__hint {
    padding-top: 2px;
  }
}
</style>
