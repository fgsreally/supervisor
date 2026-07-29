<template>
  <div v-if="agent" class="agent-config mx-auto w-full max-w-[1040px]">
    <div v-if="loading" class="agent-config-loading">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在加载 Agent 配置...
    </div>
    <template v-else>
      <section class="agent-config-section">
        <div class="agent-config-section__title">
          <div>
            <h3>基本配置</h3>
            <p>Agent 的身份与默认运行设置</p>
          </div>
        </div>
        <dl class="agent-config-list">
          <div class="agent-config-row">
            <dt>名称</dt>
            <dd>{{ agent.name }}</dd>
          </div>
          <div class="agent-config-row">
            <dt>描述</dt>
            <dd>{{ agent.description || "-" }}</dd>
          </div>
          <div class="agent-config-row">
            <dt>模型</dt>
            <dd>
              <ModelTreeSelect
                class="agent-model-select"
                :model-value="agent.modelId || ''"
                :groups="modelGroups"
                :disabled="savingModel"
                placeholder="稍后配置"
                @change="changeModel"
              />
            </dd>
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

      <section v-if="resolvedTools.length" class="agent-config-section agent-tools-section">
        <div class="agent-tools-header">
          <div>
            <div class="text-[14px] font-medium">可用工具</div>
            <p>控制该 Agent 在后续新会话中可以调用的能力</p>
          </div>
          <span>{{ enabledToolCount }}/{{ resolvedTools.length }} 已启用</span>
        </div>
        <div class="agent-tools-list">
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Loader2, Puzzle, ShieldCheck, Wrench } from "lucide-vue-next";
import { useAgentStore, useProviderStore } from "@/store";
import { getDefaultWorkspaceCwd } from "@/config/workspace";
import { showUiMessage } from "@/composables/use-ui-message";
import type { AgentResources } from "@/api";
import { providerToUI } from "@/utils/provider-ui";
import ModelTreeSelect, { type ModelTreeGroup } from "./ModelTreeSelect.vue";

const props = defineProps<{ agentId: string }>();
const agentStore = useAgentStore();
const providerStore = useProviderStore();
const agent = computed(() => agentStore.getAgentById(props.agentId));
const modelGroups = computed<ModelTreeGroup[]>(() =>
  providerStore.providers
    .map((provider) => providerToUI(provider, providerStore.models[provider.id] ?? []))
    .filter((provider) => provider.isEnabled)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      icon: provider.icon,
      models: provider.models.map((model) => ({ value: model.id, name: model.name })),
    })),
);
const homeDir = computed(
  () => agent.value?.homeDir || agentStore.agentResources[props.agentId]?.homeDir || "",
);
const resolvedTools = computed(() => agentStore.agentResources[props.agentId]?.tools ?? []);
const enabledToolCount = computed(() => resolvedTools.value.filter((tool) => tool.enabled).length);
const savingTool = ref<string | null>(null);
const savingModel = ref(false);
const loading = ref(false);

function sourceLabel(tool: AgentResources["tools"][number]): string {
  if (tool.source === "extension") return tool.extensionName || "扩展";
  return tool.source === "preset" ? "工具集" : "系统";
}

async function toggleTool(name: string, enabled: boolean) {
  const current = agent.value;
  if (!current || savingTool.value) return;
  savingTool.value = name;
  const disabled = new Set(current.disabledTools);
  if (enabled) disabled.add(name);
  else disabled.delete(name);
  try {
    await agentStore.updateAgent(props.agentId, {
      disabledTools: [...disabled],
    });
    await agentStore.fetchAgentResources(props.agentId, getDefaultWorkspaceCwd());
    showUiMessage(enabled ? `已禁用 ${name}` : `已启用 ${name}`, "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "工具设置失败", "error");
  } finally {
    savingTool.value = null;
  }
}

async function changeModel(modelId: string) {
  if (!agent.value || savingModel.value) return;
  const provider = modelGroups.value.find((group) =>
    group.models.some((model) => model.value === modelId),
  );
  if (!provider) return;
  savingModel.value = true;
  try {
    await agentStore.updateAgent(props.agentId, { modelId });
    showUiMessage("模型已更新", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "模型更新失败", "error");
  } finally {
    savingModel.value = false;
  }
}

watch(
  () => props.agentId,
  async (id) => {
    loading.value = true;
    try {
      await agentStore.fetchAgentResources(id, getDefaultWorkspaceCwd());
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.agent-config {
  padding: 2px 0 28px;
}

.agent-config-section {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-border-subtle) 84%, transparent);
  border-radius: 12px;
  background: var(--app-settings-card);
  color: var(--app-text-primary);
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}

.agent-tools-section {
  margin-top: 18px;
}

.agent-config-loading {
  display: flex;
  min-height: 12rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.agent-config-section__title {
  display: flex;
  align-items: center;
  min-height: 64px;
  padding: 13px 20px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.agent-config-section__title h3 {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.agent-config-section__title p {
  margin-top: 3px;
  color: var(--app-text-muted);
  font-size: 11px;
}

.agent-config-list {
  padding: 0 20px;
}

.agent-config-row {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  min-height: 54px;
  align-items: center;
  gap: 18px;
  padding: 9px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border-subtle) 78%, transparent);
  font-size: 13px;
}
.agent-config-row:last-child {
  border-bottom: 0;
}

.agent-config-row dt,
.agent-config-muted {
  color: var(--app-text-secondary);
}
.agent-config-row dd {
  min-width: 0;
  color: var(--app-text-primary);
  font-weight: 450;
}
.agent-model-select {
  max-width: 560px;
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
  min-height: 68px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--app-border-subtle);
}
.agent-tools-header p {
  margin-top: 4px;
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 400;
}
.agent-tools-header > span {
  flex: none;
  padding: 4px 8px;
  border-radius: 999px;
  color: var(--app-text-secondary);
  background: color-mix(in srgb, var(--app-hover) 76%, transparent);
  font-size: 11px;
}

.agent-tools-list {
  padding: 0 20px;
}
.agent-tool-row {
  display: flex;
  align-items: center;
  gap: 13px;
  min-height: 72px;
  padding: 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border-subtle) 78%, transparent);
  transition: background-color 0.15s ease;
}
.agent-tool-row:hover {
  background: color-mix(in srgb, var(--app-hover) 44%, transparent);
}
.agent-tool-row:last-child {
  border-bottom: 0;
}
.agent-tool-row--disabled {
  opacity: 0.58;
}
.agent-tool-row--disabled .agent-tool-heading > span:first-child {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  text-decoration-color: color-mix(in srgb, var(--app-text-muted) 80%, transparent);
}
.agent-tool-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border-radius: 9px;
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
  display: -webkit-box;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.agent-tool-meta {
  margin-top: 4px;
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

@media (max-width: 760px) {
  .agent-config-row {
    grid-template-columns: 86px minmax(0, 1fr);
  }
  .agent-config-list,
  .agent-tools-list {
    padding-inline: 16px;
  }
  .agent-config-section__title,
  .agent-tools-header {
    padding-inline: 16px;
  }
}
</style>
