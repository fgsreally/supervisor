<template>
  <Teleport to="body">
    <Transition name="agent-picker">
      <div
        v-if="open"
        class="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
        @mousedown.self="emit('close')"
      >
        <div class="absolute inset-0 bg-black/45" />
        <div
          class="agent-picker relative w-full sm:max-w-[380px] sm:rounded-xl flex flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="agent-picker-title"
          @mousedown.stop
        >
          <header class="agent-picker__header shrink-0">
            <span class="w-9" />
            <h2 id="agent-picker-title" class="agent-picker__title">选择 Agent</h2>
            <div class="agent-picker__actions">
              <button
                type="button"
                class="agent-picker__nav"
                title="重新检测外部 Agent"
                :disabled="detecting"
                @click="detectAgents"
              >
                <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': detecting }" />
              </button>
              <button type="button" class="agent-picker__nav" title="关闭" @click="emit('close')">
                <X class="w-5 h-5" />
              </button>
            </div>
          </header>

          <div class="agent-picker__body custom-scrollbar">
            <div v-if="project" class="agent-picker__project-chip">
              <FolderOpen class="w-3.5 h-3.5 shrink-0" />
              <span class="truncate">{{ project.name }} · {{ project.cwd }}</span>
            </div>
            <button
              v-for="agent in agents"
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
                class="agent-picker__avatar-comp !rounded-full w-11 h-11 text-base"
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
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { FolderOpen, RefreshCw, X } from "lucide-vue-next";
import type { Project } from "@/api";
import { useAgentStore } from "@/store";
import AgentAvatar from "./AgentAvatar.vue";

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
const agents = computed(() => agentStore.agents);
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
  max-height: min(82vh, 560px);
  background: var(--app-chat-bg);
  color: var(--app-text-primary);
  box-shadow: 0 -8px 32px rgb(0 0 0 / 18%);
}

@media (min-width: 640px) {
  .agent-picker {
    box-shadow: 0 12px 40px rgb(0 0 0 / 18%);
  }
}

.agent-picker__header {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 4px;
  min-height: 52px;
  padding: 0 8px;
  background: var(--app-chat-header-bg);
  border-bottom: 1px solid var(--app-border-subtle);
}

.agent-picker__title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  text-align: center;
}

.agent-picker__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  min-width: 40px;
}

.agent-picker__nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--app-text-secondary);
}

.agent-picker__nav:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.agent-picker__nav:disabled {
  opacity: 0.45;
}

.agent-picker__body {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding-bottom: 12px;
}

.agent-picker__row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  text-align: left;
  background: var(--app-settings-card);
  border-bottom: 1px solid var(--app-divider);
  transition: background-color 0.12s ease;
}

.agent-picker__row:hover:not(:disabled) {
  background: var(--app-popup-hover);
}

.agent-picker__row--disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.agent-picker__avatar-comp {
  border-radius: 50% !important;
  overflow: hidden;
}

.agent-picker__name {
  font-size: 16px;
  line-height: 1.3;
  color: var(--app-text-primary);
}

.agent-picker__desc {
  margin-top: 2px;
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

.agent-picker__project-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 12px 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--app-settings-card);
  color: var(--app-text-secondary);
  font-size: 12px;
}

.agent-picker-enter-active,
.agent-picker-leave-active {
  transition: opacity 0.18s ease;
}

.agent-picker-enter-active .agent-picker,
.agent-picker-leave-active .agent-picker {
  transition:
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.18s ease;
}

.agent-picker-enter-from,
.agent-picker-leave-to {
  opacity: 0;
}

.agent-picker-enter-from .agent-picker,
.agent-picker-leave-to .agent-picker {
  transform: translateY(18px);
  opacity: 0;
}

@media (min-width: 640px) {
  .agent-picker-enter-from .agent-picker,
  .agent-picker-leave-to .agent-picker {
    transform: scale(0.96) translateY(0);
  }
}
</style>
