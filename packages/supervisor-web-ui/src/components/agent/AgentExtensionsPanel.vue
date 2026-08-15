<template>
  <div class="agent-ext flex flex-1 min-h-0 overflow-hidden">
    <div
      v-if="loading"
      class="agent-ext-main flex flex-1 items-center justify-center gap-2 text-[13px]"
    >
      <Loader2 class="h-4 w-4 animate-spin" />
      正在加载扩展...
    </div>
    <template v-else>
      <div
        class="agent-ext-sidebar shrink-0 border-r flex flex-col min-h-0 relative"
        :style="{ width: `${sidebarWidth}px` }"
      >
        <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-3 space-y-5">
          <section>
            <div class="agent-ext-section-title">内置扩展</div>
            <p class="agent-ext-hint">随 Agent 提供，不可移除</p>
            <div class="mt-2 space-y-1">
              <div v-for="item in builtinItems" :key="item.resourceId" class="agent-ext-row">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="agent-ext-name truncate">{{ item.name }}</span>
                    <span class="agent-ext-badge">内置</span>
                  </div>
                  <p v-if="item.description" class="agent-ext-desc truncate">
                    {{ item.description }}
                  </p>
                </div>
              </div>
              <div v-if="builtinItems.length === 0" class="agent-ext-empty">暂无</div>
            </div>
          </section>

          <section>
            <div class="agent-ext-section-title">已添加扩展</div>
            <p class="agent-ext-hint">从本 Agent 移除，不会卸载全局扩展</p>
            <div class="mt-2 space-y-1">
              <div v-for="item in userItems" :key="item.resourceId" class="agent-ext-row">
                <div class="min-w-0 flex-1">
                  <div class="agent-ext-name truncate">{{ item.name }}</div>
                  <p v-if="item.description" class="agent-ext-desc truncate">
                    {{ item.description }}
                  </p>
                </div>
                <button
                  type="button"
                  class="agent-ext-remove"
                  :disabled="removingId === item.resourceId"
                  @click="remove(item)"
                >
                  移除
                </button>
              </div>
              <div v-if="userItems.length === 0" class="agent-ext-empty">尚未添加用户扩展</div>
            </div>
          </section>
        </div>

        <GlobalResourceBindBar
          :items="unlinkedGlobal"
          kind="extensions"
          :binding-item-id="bindingItemId"
          @bind="bindGlobalItem"
          @installed="reload"
          @uninstalled="reload"
        />
        <ResizeHandle
          class="agent-ext-resize-handle"
          orientation="vertical"
          label="调整扩展侧边栏宽度"
          @start="startSidebarResize"
        />
      </div>

      <div
        class="agent-ext-main flex-1 flex items-center justify-center text-[13px] px-6 text-center"
      >
        从下方全局库添加扩展；添加后即可使用。
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Loader2 } from "lucide-vue-next";
import GlobalResourceBindBar from "@/components/resource/GlobalResourceBindBar.vue";
import ResizeHandle from "@/components/base/ResizeHandle.vue";
import { useAgentStore, useResourceStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import { useResizableWidth } from "@/composables/use-resizable-width";
import { getResourcesByKind } from "@/utils/resources-ui";
import { resourceEntryPath } from "@/utils/resource-utils";
import type { AgentExtensionInfo } from "@/api/api";
import type { UIResourceItem } from "@/types/ui";

const props = defineProps<{ agentId: string }>();

const agentStore = useAgentStore();
const resourceStore = useResourceStore();

const extensions = ref<AgentExtensionInfo[]>([]);
const removingId = ref<number | null>(null);
const bindingItemId = ref<string | null>(null);
const loading = ref(false);
const { width: sidebarWidth, startResize: startSidebarResize } = useResizableWidth({
  defaultWidth: 288,
  minWidth: 220,
  maxWidth: 560,
  storageKey: "agent-extensions-sidebar-width",
});

const builtinItems = computed(() => extensions.value.filter((item) => item.builtin));
const userItems = computed(() => extensions.value.filter((item) => !item.builtin));

const unlinkedGlobal = computed(() => {
  const linked = new Set(userItems.value.map((item) => item.slug));
  const builtinNames = new Set(builtinItems.value.flatMap((item) => [item.slug, item.name]));
  return getResourcesByKind(resourceStore.resourceItems, "extensions").filter((item) => {
    if (builtinNames.has(item.name)) return false;
    if (linked.has(item.name)) return false;
    return Boolean(item.rootPath ?? resourceEntryPath(item));
  });
});

async function reload() {
  loading.value = true;
  try {
    await resourceStore.fetchGlobalResources();
    extensions.value = await agentStore.fetchAgentExtensions(props.agentId);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.agentId,
  () => {
    void reload();
  },
  { immediate: true },
);

async function remove(item: AgentExtensionInfo) {
  if (item.builtin) return;
  removingId.value = item.resourceId;
  try {
    await agentStore.unbindAgentResource(props.agentId, item.resourceId);
    extensions.value = extensions.value.filter((row) => row.resourceId !== item.resourceId);
    showUiMessage(`已移除 ${item.name}`, "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "移除失败", "error");
  } finally {
    removingId.value = null;
  }
}

async function bindGlobalItem(item: UIResourceItem) {
  const sourcePath = item.rootPath ?? resourceEntryPath(item);
  if (!sourcePath) return;
  try {
    bindingItemId.value = item.id;
    await agentStore.bindAgentResource(props.agentId, "extension", sourcePath);
    await reload();
    showUiMessage(`已添加 ${item.name}`, "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "添加失败", "error");
  } finally {
    bindingItemId.value = null;
  }
}
</script>

<style scoped>
.agent-ext-sidebar {
  background: var(--app-resource-sidebar-bg);
  border-color: var(--app-border);
}

@media (max-width: 767px) {
  .agent-ext {
    display: block;
    overflow-y: auto;
  }

  .agent-ext-sidebar {
    width: 100% !important;
    min-height: 100%;
    border-right: 0;
  }

  .agent-ext-main {
    display: none;
  }

  .agent-ext-resize-handle {
    display: none;
  }
}

.agent-ext-main {
  background: var(--app-settings-bg);
  color: var(--app-text-secondary);
}

.agent-ext-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text);
}

.agent-ext-hint {
  margin-top: 2px;
  font-size: 11px;
  color: var(--app-text-secondary);
}

.agent-ext-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--app-resource-tree-bg, transparent);
}

.agent-ext-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text);
}

.agent-ext-desc {
  margin-top: 2px;
  font-size: 11px;
  color: var(--app-text-secondary);
}

.agent-ext-badge {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--app-border);
  color: var(--app-text-secondary);
}

.agent-ext-empty {
  font-size: 12px;
  color: var(--app-text-secondary);
  padding: 8px 4px;
}

.agent-ext-remove {
  flex-shrink: 0;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--app-border);
  color: var(--app-text);
  background: transparent;
}

.agent-ext-remove:hover:not(:disabled) {
  border-color: var(--app-danger, #dc2626);
  color: var(--app-danger, #dc2626);
}
</style>
