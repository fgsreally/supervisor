<template>
  <div class="agent-ext flex flex-1 min-h-0 overflow-hidden">
    <div class="agent-ext-sidebar w-72 shrink-0 border-r flex flex-col min-h-0">
      <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-3 space-y-5">
        <section>
          <div class="agent-ext-section-title">内置扩展</div>
          <p class="agent-ext-hint">仅可启用/停用，不可删除</p>
          <div class="mt-2 space-y-1">
            <div
              v-for="item in builtinItems"
              :key="item.resourceId"
              class="agent-ext-row"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="agent-ext-name truncate">{{ item.name }}</span>
                  <span class="agent-ext-badge">内置</span>
                </div>
                <p v-if="item.description" class="agent-ext-desc truncate">{{ item.description }}</p>
                <p
                  v-if="coreSlugs.has(item.slug) && !item.enabled"
                  class="agent-ext-warn"
                >
                  停用后对应能力不可用
                </p>
              </div>
              <button
                type="button"
                class="agent-ext-switch"
                :class="item.enabled ? 'agent-ext-switch--on' : 'agent-ext-switch--off'"
                :disabled="togglingId === item.resourceId"
                :aria-pressed="item.enabled"
                @click="toggle(item)"
              >
                <span class="agent-ext-switch-knob" />
              </button>
            </div>
            <div v-if="builtinItems.length === 0" class="agent-ext-empty">暂无</div>
          </div>
        </section>

        <section>
          <div class="agent-ext-section-title">已添加扩展</div>
          <p class="agent-ext-hint">从本 Agent 移除，不会卸载全局扩展</p>
          <div class="mt-2 space-y-1">
            <div
              v-for="item in userItems"
              :key="item.resourceId"
              class="agent-ext-row"
            >
              <div class="min-w-0 flex-1">
                <div class="agent-ext-name truncate">{{ item.name }}</div>
                <p v-if="item.description" class="agent-ext-desc truncate">{{ item.description }}</p>
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
    </div>

    <div class="agent-ext-main flex-1 flex items-center justify-center text-[13px] px-6 text-center">
      内置扩展只能开关；用户扩展可从下方全局库添加或从列表移除。
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import GlobalResourceBindBar from "./GlobalResourceBindBar.vue";
import { useAgentStore, useResourceStore } from "@/store";
import { showUiMessage } from "@/composables/use-ui-message";
import { getResourcesByKind } from "@/utils/resources-ui";
import { resourceEntryPath } from "@/utils/resource-utils";
import type { AgentExtensionInfo } from "@/api/api";
import type { UIResourceItem } from "@/types/ui";

const props = defineProps<{ agentId: string }>();

const agentStore = useAgentStore();
const resourceStore = useResourceStore();

const extensions = ref<AgentExtensionInfo[]>([]);
const togglingId = ref<number | null>(null);
const removingId = ref<number | null>(null);
const bindingItemId = ref<string | null>(null);

const coreSlugs = new Set(["skill", "mcp", "subagent"]);

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
  await resourceStore.fetchGlobalResources();
  extensions.value = await agentStore.fetchAgentExtensions(props.agentId);
}

watch(
  () => props.agentId,
  () => {
    void reload();
  },
  { immediate: true },
);

async function toggle(item: AgentExtensionInfo) {
  togglingId.value = item.resourceId;
  try {
    await agentStore.setAgentExtensionEnabled(props.agentId, item.resourceId, !item.enabled);
    item.enabled = !item.enabled;
    showUiMessage(item.enabled ? `已启用 ${item.name}` : `已停用 ${item.name}`, "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "更新失败", "error");
  } finally {
    togglingId.value = null;
  }
}

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

.agent-ext-warn {
  margin-top: 2px;
  font-size: 10px;
  color: var(--app-warning, #b45309);
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

.agent-ext-switch {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  border: none;
  flex-shrink: 0;
  padding: 0;
  transition: background 0.15s ease;
}

.agent-ext-switch--on {
  background: var(--app-accent, #2563eb);
}

.agent-ext-switch--off {
  background: var(--app-border);
}

.agent-ext-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #fff;
  transition: transform 0.15s ease;
}

.agent-ext-switch--on .agent-ext-switch-knob {
  transform: translateX(16px);
}
</style>
