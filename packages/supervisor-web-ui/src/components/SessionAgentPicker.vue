<template>
  <Teleport to="body">
    <Transition name="agent-picker">
      <div
        v-if="open"
        class="fixed inset-0 z-[200] flex items-center justify-center p-4"
        @mousedown.self="emit('close')"
      >
        <div class="absolute inset-0 bg-black/40" />
        <div
          class="agent-picker-modal relative w-full max-w-[360px] rounded-lg border shadow-xl flex flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="agent-picker-title"
          @mousedown.stop
        >
          <header
            class="agent-picker-modal__header flex items-center justify-between px-4 py-3 border-b shrink-0"
          >
            <h2 id="agent-picker-title" class="text-[15px] font-medium">选择 Agent</h2>
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="agent-picker-modal__close"
                title="重新检测外部 Agent"
                :disabled="detecting"
                @click="detectAgents"
              >
                <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': detecting }" />
              </button>
              <button
                type="button"
                class="agent-picker-modal__close"
                title="关闭"
                @click="emit('close')"
              >
                <X class="w-5 h-5" />
              </button>
            </div>
          </header>

          <ul class="max-h-[min(60vh,420px)] overflow-y-auto custom-scrollbar py-1">
            <li
              v-for="agent in agents"
              :key="agent.id"
              role="option"
              class="agent-picker-modal__item px-4 py-3 flex items-center gap-3"
              :class="agent.available ? 'cursor-pointer' : 'agent-picker-modal__item--disabled'"
              :aria-disabled="!agent.available"
              @click="agent.available && emit('select', agent.id)"
            >
              <div
                class="w-10 h-10 rounded-md flex items-center justify-center text-white text-sm font-medium shrink-0"
                :class="agentAvatarClass(agent.id)"
              >
                {{ agent.name.substring(0, 1).toUpperCase() }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-[14px] truncate">{{ agent.name }}</div>
                <div class="text-[12px] truncate agent-picker-modal__desc">
                  {{ agent.available ? agent.description : agent.unavailableReason }}
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RefreshCw, X } from "lucide-vue-next";
import { useAgentStore } from "@/store";
import { agentAvatarClass } from "../utils/avatar-class";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  select: [agentId: string];
}>();

const agentStore = useAgentStore();
const agents = computed(() => agentStore.agents);
const detecting = ref(false);

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
.agent-picker-modal {
  background: var(--app-popup-bg);
  border-color: var(--app-popup-border);
  color: var(--app-text-primary);
}

.agent-picker-modal__header {
  border-color: var(--app-border-subtle);
}

.agent-picker-modal__close {
  padding: 4px;
  border-radius: 6px;
  color: var(--app-text-muted);
  transition:
    background-color 0.15s,
    color 0.15s;
}

.agent-picker-modal__close:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.agent-picker-modal__item:hover {
  background: var(--app-popup-hover);
}

.agent-picker-modal__item--disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.agent-picker-modal__desc {
  color: var(--app-text-muted);
}

.agent-picker-enter-active,
.agent-picker-leave-active {
  transition: opacity 0.2s ease;
}

.agent-picker-enter-active .agent-picker-modal,
.agent-picker-leave-active .agent-picker-modal {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.agent-picker-enter-from,
.agent-picker-leave-to {
  opacity: 0;
}

.agent-picker-enter-from .agent-picker-modal,
.agent-picker-leave-to .agent-picker-modal {
  transform: scale(0.96);
  opacity: 0;
}
</style>
