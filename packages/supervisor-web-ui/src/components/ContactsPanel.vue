<template>
  <div
    class="h-full w-full flex flex-col shrink-0 min-w-0"
    :style="{ ...panelStyle, background: 'var(--app-list-section-bg)' }"
  >
    <div
      v-if="!mobileSearchOpen"
      class="h-16 flex items-center px-4 shrink-0 border-b"
      style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)"
    >
      <h1 class="text-[16px] font-medium flex-1" style="color: var(--app-text-primary)">
        智能代理
      </h1>
      <button type="button" class="mobile-search-trigger" aria-label="搜索" @click="mobileSearchOpen = true">
        <Search />
      </button>
      <button type="button" class="list-header-btn" title="添加智能代理" @click="$emit('add')">
        <UserPlus class="w-5 h-5" />
      </button>
    </div>

    <div v-else class="mobile-search-page">
      <button type="button" aria-label="返回" @click="mobileSearchOpen = false"><ArrowLeft /></button>
      <Search />
      <input v-model="query" type="search" placeholder="搜索智能代理" autofocus />
    </div>

    <div
      class="panel-inline-search px-3 py-2 shrink-0 border-b"
      style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)"
    >
      <div class="relative">
        <Search class="w-4 h-4 absolute left-2.5 top-2" style="color: var(--app-text-muted)" />
        <input
          v-model="query"
          type="text"
          placeholder="搜索智能代理"
          class="list-search-input w-full rounded-md pl-8 pr-2 py-1.5 text-[13px] focus:outline-none transition-colors"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <template v-for="group in filteredGroups" :key="group.label">
        <div
          class="list-section-label px-4 py-1.5 text-[11px] font-semibold tracking-wide sticky top-0 z-10"
        >
          {{ group.label }}
        </div>
        <DustTransitionGroup name="session-list" tag="div" content-class="agent-list-roots">
          <AgentListItem
            v-for="agent in group.agents"
            :key="agent.id"
            :agent="agent"
            :active="activeId === agent.id"
            @select="$emit('select', $event)"
            @contextmenu="openContextMenu"
          />
        </DustTransitionGroup>
      </template>

      <div
        v-if="!filteredGroups.length"
        class="py-12 text-center text-sm"
        style="color: var(--app-text-muted)"
      >
        无匹配智能代理
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="fixed inset-0 z-[150]"
        @mousedown="contextMenu = null"
        @contextmenu.prevent="contextMenu = null"
      >
        <div
          class="agent-context-menu fixed min-w-[120px] rounded-md border py-1 shadow-lg"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @mousedown.stop
        >
          <button
            type="button"
            class="agent-context-menu__delete w-full px-4 py-2 text-left text-[13px]"
            @click="deleteContextAgent"
          >
            删除
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowLeft, Search, UserPlus } from "lucide-vue-next";
import type { Agent } from "@/api";
import { useAgentStore } from "@/store";
import AgentListItem from "./AgentListItem.vue";
import DustTransitionGroup from "./DustTransitionGroup.vue";
import { requestUiConfirm } from "@/composables/use-ui-confirm";
import { showUiMessage } from "@/composables/use-ui-message";

const props = defineProps<{
  activeId: string;
  width?: number;
}>();
const mobileSearchOpen = ref(false);

const panelStyle = computed(() => {
  if (props.width == null) return undefined;
  return { width: `${props.width}px` };
});

const emit = defineEmits<{ select: [id: string]; add: [] }>();

const agentStore = useAgentStore();
const query = ref("");
const contextMenu = ref<{ agent: Agent; x: number; y: number } | null>(null);

function openContextMenu(event: MouseEvent, agent: Agent) {
  if (agent.isBuiltin || agent.backendType !== "native") return;
  contextMenu.value = {
    agent,
    x: Math.min(event.clientX, window.innerWidth - 140),
    y: Math.min(event.clientY, window.innerHeight - 52),
  };
}

async function deleteContextAgent() {
  const target = contextMenu.value?.agent;
  contextMenu.value = null;
  if (!target) return;
  const confirmed = await requestUiConfirm({
    title: "删除智能代理",
    message: `确定删除“${target.name}”吗？`,
    confirmText: "删除",
    danger: true,
  });
  if (!confirmed) return;
  try {
    await agentStore.deleteAgent(target.id);
    if (props.activeId === target.id) emit("select", agentStore.agents[0]?.id ?? "");
    showUiMessage("智能代理已删除", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "删除智能代理失败", "error");
  }
}

const filteredGroups = computed(() => {
  const q = query.value.trim().toLowerCase();
  const groups = agentStore.getAgentsByCategory;
  if (!q) return groups;

  return groups
    .map((g) => ({
      ...g,
      agents: g.agents.filter(
        (a: Agent) =>
          a.name.toLowerCase().includes(q) ||
          (a.description ?? "").toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.agents.length > 0);
});
</script>

<style scoped>
.list-header-btn {
  padding: 6px;
  border-radius: 6px;
  color: var(--app-nav-icon);
  transition: background-color 0.15s;
}

.list-header-btn:hover {
  background: var(--app-hover);
}

.list-search-input {
  background: var(--app-list-search-bg);
  color: var(--app-text-primary);
}

.list-search-input:focus {
  background: var(--app-list-search-focus-bg);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-accent) 50%, transparent);
}

.list-section-label {
  background: var(--app-list-section-bg);
  color: var(--app-text-secondary);
}

.agent-context-menu {
  border-color: var(--app-popup-border);
  background: var(--app-popup-bg);
}

.agent-context-menu__delete {
  color: #fa5151;
}

.agent-context-menu__delete:hover {
  background: var(--app-popup-hover);
}

.mobile-search-trigger,
.mobile-search-page {
  display: none;
}

@media (max-width: 767px) {
  .panel-inline-search {
    display: none;
  }
  .mobile-search-trigger {
    display: grid;
    width: 40px;
    height: 40px;
    margin-left: auto;
    place-items: center;
  }
  .mobile-search-trigger svg {
    width: 21px;
    height: 21px;
  }
  .mobile-search-page {
    display: grid;
    min-height: 52px;
    grid-template-columns: 40px 20px minmax(0, 1fr);
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    border-bottom: 1px solid var(--app-border-subtle);
    background: var(--app-list-header-bg);
  }
  .mobile-search-page button {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
  }
  .mobile-search-page svg {
    width: 20px;
    height: 20px;
    color: var(--app-text-secondary);
  }
  .mobile-search-page input {
    min-width: 0;
    height: 36px;
    background: transparent;
    outline: none;
  }
}
</style>
