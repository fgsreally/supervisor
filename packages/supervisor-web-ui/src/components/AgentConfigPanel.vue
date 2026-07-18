<template>
  <div v-if="agent" class="agent-config max-w-3xl">
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
      <div class="agent-config-section__title px-4 py-3 border-b text-[14px] font-medium">
        可用工具 <span class="agent-config-muted ml-1">{{ resolvedTools.length }}</span>
      </div>
      <div class="divide-y agent-config-divider">
        <div
          v-for="tool in resolvedTools"
          :key="tool.name"
          class="px-4 py-2.5 flex items-center gap-3"
        >
          <span class="font-mono text-[12px]">{{ tool.name }}</span>
          <span class="agent-config-tool-source text-[11px] px-1.5 py-0.5 rounded">{{
            tool.source
          }}</span>
          <span v-if="tool.extensionName" class="agent-config-muted text-[12px]">{{
            tool.extensionName
          }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useAgentStore, useProviderStore } from "@/store";
import { getDefaultWorkspaceCwd } from "@/config/workspace";

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
  background: color-mix(in srgb, var(--app-accent) 12%, transparent);
  color: var(--app-accent);
}
</style>
