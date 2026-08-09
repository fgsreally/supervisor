<template>
  <div
    class="agent-list-item flex items-center gap-3 px-4 py-3 transition-colors relative cursor-pointer"
    :class="{
      'agent-list-item--active': active,
      'agent-list-item--struck': isNotInstalledExternal || isUnavailableNative,
    }"
    @click="onSelect"
    @contextmenu.prevent="$emit('contextmenu', $event, agent)"
  >
    <AgentAvatar
      :agent-id="agent.id"
      :agent-name="agent.name"
      :icon="agent.avatar"
      class="agent-list-item__avatar w-10 h-10 text-base"
    />

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="text-[13px] font-medium truncate agent-list-item__name">{{ agent.name }}</span>
        <span
          v-if="isUnavailableNative"
          class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium agent-list-item__badge agent-list-item__badge--disabled"
        >
          未配置
        </span>
        <span
          v-else-if="!isUnavailableExternal"
          class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium agent-list-item__preset"
        >
          {{ presetLabel }}
        </span>
      </div>
      <div
        v-if="summaryText"
        class="text-[11px] truncate mt-0.5 agent-list-item__desc"
        :class="{ 'agent-list-item__desc--error': isBrokenExternal }"
      >
        {{ summaryText }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useProviderStore } from "@/store";
import type { Agent } from "@/api";
import AgentAvatar from "./AgentAvatar.vue";
import { isExternalAgent } from "@/composables/use-external-agent-actions";

const props = defineProps<{
  agent: Agent;
  active?: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  contextmenu: [event: MouseEvent, agent: Agent];
}>();

const providerStore = useProviderStore();
const isUnavailableExternal = computed(
  () => isExternalAgent(props.agent) && props.agent.available === false,
);
/** CLI binary missing on host. */
const isNotInstalledExternal = computed(
  () => isUnavailableExternal.value && !props.agent.executablePath,
);
/** Binary found but detect/version check failed. */
const isBrokenExternal = computed(
  () => isUnavailableExternal.value && Boolean(props.agent.executablePath),
);
const isUnavailableNative = computed(
  () => props.agent.backendType === "native" && (!props.agent.providerId || !props.agent.modelId),
);

const modelSummary = computed(() => {
  if (!props.agent.providerId || !props.agent.modelId) return props.agent.description ?? "";
  const provider = providerStore.getProviderById(props.agent.providerId);
  const model = providerStore.models[props.agent.providerId]?.find(
    (item) => item.id === props.agent.modelId,
  );
  return `${provider?.name ?? "未找到供应商"} / ${model?.name || model?.modelId || "未找到模型"}`;
});

const summaryText = computed(() => {
  if (isNotInstalledExternal.value) return "";
  if (isBrokenExternal.value) {
    return props.agent.unavailableReason || "检测失败";
  }
  if (isUnavailableNative.value) return "未配置模型";
  if (isExternalAgent(props.agent) && props.agent.detectedVersion) {
    return props.agent.detectedVersion;
  }
  return modelSummary.value;
});

const presetLabel = computed(() => {
  switch (props.agent.toolsPreset) {
    case "coding":
      return "coding";
    case "readonly":
      return "readonly";
    case "none":
      return "no tools";
    default:
      return props.agent.toolsPreset;
  }
});

function onSelect() {
  emit("select", props.agent.id);
}
</script>

<style scoped>
.agent-list-item {
  background: var(--app-list-bg);
}

.agent-list-item:hover {
  background: var(--app-list-item-hover);
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--app-accent) 65%, transparent);
}

.agent-list-item--active {
  background: var(--app-list-item-active);
  box-shadow: inset 3px 0 0 var(--app-accent);
}

.agent-list-item--active:hover {
  background: color-mix(in srgb, var(--app-list-item-active) 90%, var(--app-hover));
}

.agent-list-item--struck .agent-list-item__avatar {
  filter: grayscale(1);
  opacity: 0.62;
}

.agent-list-item--struck .agent-list-item__name {
  opacity: 0.62;
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.agent-list-item__name {
  color: var(--app-text-primary);
}

.agent-list-item__preset {
  background: color-mix(in srgb, var(--app-hover) 70%, transparent);
  color: var(--app-text-secondary);
}

.agent-list-item__badge--disabled {
  background: color-mix(in srgb, #fa5151 16%, transparent);
  color: #fa5151;
}

.agent-list-item__desc {
  color: var(--app-text-secondary);
}

.agent-list-item__desc--error {
  color: #e54d42;
}

.agent-list-item--active .agent-list-item__name,
.agent-list-item--active .agent-list-item__preset,
.agent-list-item--active .agent-list-item__desc {
  color: var(--app-list-item-active-text);
}

.agent-list-item--active .agent-list-item__preset {
  background: color-mix(in srgb, var(--app-list-item-active-text) 18%, transparent);
}
</style>
