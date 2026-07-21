<template>
  <div v-if="agent" class="agent-config w-full">
    <section class="agent-config-section border rounded-md overflow-hidden">
      <div class="agent-config-section__title px-4 py-3 border-b text-[14px] font-medium">
        基本配置
      </div>
      <dl class="divide-y agent-config-divider">
        <div class="agent-config-row">
          <dt>名称</dt>
          <dd>{{ agent.name }}</dd>
        </div>
        <div class="agent-config-row">
          <dt>描述</dt>
          <dd>{{ agent.description || "-" }}</dd>
        </div>
        <div class="agent-config-row">
          <dt>模型服务</dt>
          <dd>{{ providerLabel }}</dd>
        </div>
        <div class="agent-config-row">
          <dt>模型</dt>
          <dd class="font-mono text-[12px]">{{ agent.modelId || "-" }}</dd>
        </div>
        <div class="agent-config-row">
          <dt>工具集</dt>
          <dd>{{ agent.toolsPreset || "none" }}</dd>
        </div>
        <div class="agent-config-row">
          <dt>Home 目录</dt>
          <dd class="font-mono text-[12px] break-all">{{ homeDir || "-" }}</dd>
        </div>
      </dl>
    </section>

    <section
      v-if="resolvedTools.length"
      class="agent-config-section border rounded-md overflow-hidden mt-4"
    >
      <div class="agent-tools-header">
        <div>
          <div class="text-[14px] font-medium">可用工具</div>
          <p>控制该 Agent 在后续新会话中可以调用的能力</p>
        </div>
        <span>{{ enabledToolCount }}/{{ resolvedTools.length }} 已启用</span>
      </div>
      <div class="divide-y agent-config-divider">
        <div
          v-for="tool in resolvedTools"
          :key="tool.name"
          class="agent-tool-row"
          :class="{ 'agent-tool-row--disabled': !tool.enabled }"
        >
          <div class="agent-tool-icon">
            <Puzzle v-if="tool.source === 'extension'" class="h-4 w-4" />
            <ShieldCheck v-else-if="tool.source === 'system'" class="h-4 w-4" />
            <Wrench v-else class="h-4 w-4" />
          </div>
          <div class="agent-tool-main">
            <div class="agent-tool-heading">
              <span class="font-mono text-[12px]">{{ tool.name }}</span>
              <span class="agent-config-tool-source">{{ sourceLabel(tool) }}</span>
            </div>
            <p>{{ tool.description || "该工具暂未提供用途说明" }}</p>
            <div class="agent-tool-meta">
              <span>{{ tool.enabled ? "可在新会话中调用" : "已从新会话工具集中移除" }}</span>
            </div>
          </div>
          <button
            class="agent-tool-toggle"
            type="button"
            role="switch"
            :aria-checked="tool.enabled"
            :disabled="savingTool === tool.name"
            :title="tool.enabled ? '禁用工具' : '启用工具'"
            @click="toggleTool(tool.name, tool.enabled)"
          >
            <span />
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Puzzle, ShieldCheck, Wrench } from "lucide-vue-next";
import { useAgentStore, useProviderStore } from "@/store";
import { getDefaultWorkspaceCwd } from "@/config/workspace";
import { showUiMessage } from "@/composables/use-ui-message";
import type { AgentResources } from "@/api";

const props = defineProps<{ agentId: string }>();
const agentStore = useAgentStore();
const providerStore = useProviderStore();
const agent = computed(() => agentStore.getAgentById(props.agentId));
const providerLabel = computed(() => {
  const id = agent.value?.providerId;
  return id ? (providerStore.getProviderById(id)?.name ?? id) : "-";
});
const homeDir = computed(
  () => agent.value?.homeDir || agentStore.agentResources[props.agentId]?.homeDir || "",
);
const resolvedTools = computed(() => agentStore.agentResources[props.agentId]?.tools ?? []);
const enabledToolCount = computed(() => resolvedTools.value.filter((tool) => tool.enabled).length);
const savingTool = ref<string | null>(null);

function sourceLabel(tool: AgentResources["tools"][number]): string {
  if (tool.source === "extension") return tool.extensionName || "扩展";
  return tool.source === "preset" ? "工具集" : "系统";
}

async function toggleTool(name: string, enabled: boolean) {
  const current = agent.value;
  if (!current || savingTool.value) return;
  savingTool.value = name;
  const disabled = new Set(
    Array.isArray(current.meta.disabledTools)
      ? current.meta.disabledTools.filter((item): item is string => typeof item === "string")
      : [],
  );
  if (enabled) disabled.add(name);
  else disabled.delete(name);
  try {
    await agentStore.updateAgent(props.agentId, {
      meta: { disabledTools: [...disabled] },
    });
    await agentStore.fetchAgentResources(props.agentId, getDefaultWorkspaceCwd());
    showUiMessage(enabled ? `已禁用 ${name}` : `已启用 ${name}`, "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "工具设置失败", "error");
  } finally {
    savingTool.value = null;
  }
}

watch(
  () => props.agentId,
  (id) => void agentStore.fetchAgentResources(id, getDefaultWorkspaceCwd()),
  { immediate: true },
);
</script>

<style scoped>
.agent-config-section {
  background: var(--app-settings-card);
  border-color: var(--app-border-subtle);
  color: var(--app-text-primary);
}

.agent-config-section__title,
.agent-config-divider > * {
  border-color: var(--app-border-subtle);
}

.agent-config-row {
  display: grid;
  grid-template-columns: 9rem minmax(0, 1fr);
  gap: 1rem;
  padding: 12px 16px;
  font-size: 13px;
}

.agent-config-row dt,
.agent-config-muted {
  color: var(--app-text-secondary);
}

.agent-config-tool-source {
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--app-accent) 12%, transparent);
  color: var(--app-accent);
  font-size: 10px;
}

.agent-tools-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.agent-tools-header p {
  margin-top: 3px;
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 400;
}
.agent-tools-header > span {
  flex: none;
  padding: 4px 8px;
  border-radius: 999px;
  color: var(--app-text-secondary);
  background: var(--app-hover);
  font-size: 11px;
}

.agent-tool-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  transition: background-color 0.15s ease;
}
.agent-tool-row:hover {
  background: var(--app-hover);
}
.agent-tool-row--disabled {
  opacity: 0.58;
}
.agent-tool-icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border-radius: 7px;
  color: var(--app-accent);
  background: color-mix(in srgb, var(--app-accent) 10%, var(--app-settings-card));
}
.agent-tool-main {
  min-width: 0;
  flex: 1;
}
.agent-tool-heading {
  display: flex;
  align-items: center;
  gap: 7px;
}
.agent-tool-main p {
  margin-top: 3px;
  color: var(--app-text-secondary);
  font-size: 11px;
  line-height: 1.45;
}
.agent-tool-meta {
  margin-top: 5px;
  color: var(--app-text-muted);
  font-size: 10px;
}
.agent-tool-toggle {
  position: relative;
  width: 34px;
  height: 20px;
  flex: none;
  border-radius: 999px;
  background: var(--app-border);
  transition: background-color 0.15s ease;
}
.agent-tool-toggle span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 2px rgb(0 0 0 / 20%);
  transition: transform 0.15s ease;
}
.agent-tool-toggle[aria-checked="true"] {
  background: var(--app-accent);
}
.agent-tool-toggle[aria-checked="true"] span {
  transform: translateX(14px);
}
.agent-tool-toggle:disabled {
  cursor: wait;
  opacity: 0.55;
}
</style>
