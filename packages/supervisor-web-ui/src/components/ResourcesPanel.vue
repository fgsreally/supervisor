<template>
  <div
    class="flex flex-col h-full shrink-0 min-w-0 border-r"
    :class="width == null ? 'w-full' : ''"
    :style="{
      ...(width != null ? { width: `${width}px` } : {}),
      background: 'var(--app-list-bg)',
      borderColor: 'var(--app-border)',
    }"
  >
    <div
      class="px-4 py-3 border-b"
      style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)"
    >
      <div class="text-[17px] font-medium mb-3" style="color: var(--app-text-primary)">资源</div>
      <div class="flex gap-1">
        <button
          v-for="k in kinds"
          :key="k.id"
          type="button"
          class="resources-kind-btn px-2 py-0.5 rounded text-[12px] transition-colors"
          :class="kind === k.id ? 'resources-kind-btn--active' : 'resources-kind-btn--idle'"
          @click="kind = k.id"
        >
          {{ k.label }}
        </button>
      </div>
    </div>

    <div
      class="px-3 py-1.5 shrink-0 border-b flex items-center justify-between gap-2"
      style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)"
    >
      <span class="text-[12px] shrink-0" style="color: var(--app-text-muted)">
        共{{ filteredItems.length }}个
      </span>
      <div v-if="showAction" class="flex items-center gap-0.5 shrink-0">
        <template v-if="kind === 'skills'">
          <button
            type="button"
            class="list-header-btn"
            title="搜索 Skill"
            @click="openSkillDialog('search')"
          >
            <Search class="w-5 h-5" />
          </button>
          <button
            type="button"
            class="list-header-btn"
            title="导入 Skill"
            @click="openSkillDialog('link')"
          >
            <Link class="w-5 h-5" />
          </button>
        </template>
        <button
          v-else
          type="button"
          class="list-header-btn"
          :title="actionTitle"
          @click="onAction"
        >
          <Plus class="w-5 h-5" />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="resources-item px-4 py-3 border-b cursor-pointer transition-colors"
        :class="{ 'resources-item--active': activeId === item.id }"
        :style="{ borderColor: 'var(--app-border-subtle)' }"
        @click="$emit('select', item.id)"
      >
        <div class="text-[14px] font-medium truncate resources-item__name">{{ item.name }}</div>
        <div class="text-[12px] mt-0.5 truncate resources-item__desc">{{ item.description }}</div>
      </div>
      <div
        v-if="filteredItems.length === 0"
        class="px-4 py-8 text-center text-[13px]"
        style="color: var(--app-text-muted)"
      >
        暂无资源
      </div>
    </div>

    <ResourceCreateDialog
      :open="createOpen"
      :kind="createKind"
      @close="createOpen = false"
      @created="onCreated"
    />
    <SkillInstallDialog
      :open="skillOpen"
      :mode="skillMode"
      @close="skillOpen = false"
      @installed="onSkillInstalled"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Link, Plus, Search } from "lucide-vue-next";
import ResourceCreateDialog from "./ResourceCreateDialog.vue";
import SkillInstallDialog from "./SkillInstallDialog.vue";
import { useResourceStore } from "@/store";
import { getResourcesByKind } from "@/utils/resources-ui";
import type { UIResourceKind } from "@/types/ui";

defineProps<{
  activeId: string | null;
  width?: number;
}>();

const emit = defineEmits<{ select: [id: string] }>();

const resourceStore = useResourceStore();
const kind = ref<UIResourceKind>("skills");
const createOpen = ref(false);
const skillOpen = ref(false);
const skillMode = ref<"search" | "link">("search");

const kinds = [
  { id: "skills" as const, label: "Skills" },
  { id: "extensions" as const, label: "Ext" },
  { id: "prompts" as const, label: "Prompt" },
  { id: "mcp" as const, label: "MCP" },
];

const filteredItems = computed(() => getResourcesByKind(resourceStore.resourceItems, kind.value));

const showAction = computed(
  () => kind.value === "skills" || kind.value === "prompts" || kind.value === "mcp",
);

const actionTitle = computed(() => {
  if (kind.value === "mcp") return "新建 MCP";
  return "新建 Prompt";
});

const createKind = computed<"prompt" | "mcp">(() => (kind.value === "mcp" ? "mcp" : "prompt"));

function openSkillDialog(mode: "search" | "link") {
  skillMode.value = mode;
  skillOpen.value = true;
}

function onAction() {
  createOpen.value = true;
}

async function refreshAndSelect(preferredId?: string) {
  await resourceStore.fetchGlobalResources();
  if (preferredId) {
    const match = filteredItems.value.find(
      (item) => item.name === preferredId || item.id.endsWith(`/${preferredId}`),
    );
    if (match) emit("select", match.id);
  }
}

async function onCreated(slug: string) {
  await refreshAndSelect(slug);
}

async function onSkillInstalled(slug: string) {
  await refreshAndSelect(slug);
}
</script>

<style scoped>
.resources-kind-btn--active {
  background: var(--app-accent);
  color: #ffffff;
}

.resources-kind-btn--idle {
  background: var(--app-settings-card);
  color: var(--app-text-secondary);
  border: 1px solid var(--app-border);
}

.list-header-btn {
  padding: 6px;
  border-radius: 6px;
  color: var(--app-nav-icon);
  transition: background-color 0.15s;
}

.list-header-btn:hover {
  background: var(--app-hover);
}

.resources-item__name {
  color: var(--app-text-primary);
}

.resources-item__desc {
  color: var(--app-text-secondary);
}

.resources-item:hover:not(.resources-item--active) {
  background: var(--app-list-item-hover);
}

.resources-item--active {
  background: var(--app-list-item-active);
}

.resources-item--active .resources-item__name {
  color: var(--app-list-item-active-text);
}

.resources-item--active .resources-item__desc {
  color: var(--app-list-item-active-secondary);
}
</style>
