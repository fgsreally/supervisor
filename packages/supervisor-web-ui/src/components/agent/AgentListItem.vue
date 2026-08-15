<template>
  <div
    class="agent-list-item"
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
      class="agent-list-item__avatar"
    />

    <div class="agent-list-item__content">
      <div class="agent-list-item__heading">
        <span class="agent-list-item__name">{{ agent.name }}</span>
        <span
          v-if="isUnavailableNative"
          class="agent-list-item__badge agent-list-item__badge--disabled"
        >
          {{ t("agent.notConfigured") }}
        </span>
        <span
          v-else-if="!isUnavailableExternal"
          class="agent-list-item__preset"
        >
          {{ presetLabel }}
        </span>
      </div>
      <div
        v-if="summaryText"
        class="agent-list-item__desc"
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
import AgentAvatar from "@/components/agent/AgentAvatar.vue";
import { isExternalAgent } from "@/composables/use-external-agent-actions";
import { useI18n } from "@/i18n";

const props = defineProps<{
  agent: Agent;
  active?: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  contextmenu: [event: MouseEvent, agent: Agent];
}>();

const providerStore = useProviderStore();
const { t } = useI18n();
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
  return `${provider?.name ?? t("provider.notFound")} / ${model?.name || model?.modelId || t("provider.modelNotFound")}`;
});

const summaryText = computed(() => {
  if (isNotInstalledExternal.value) return "";
  if (isBrokenExternal.value) {
    return props.agent.unavailableReason || t("agent.detectFailed");
  }
  if (isUnavailableNative.value) return t("agent.modelNotConfigured");
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
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: background-color var(--app-motion-fast), box-shadow var(--app-motion-fast);
  background: var(--app-list-bg);
}

.agent-list-item__avatar {
  width: 2.5rem;
  height: 2.5rem;
  font-size: var(--app-font-body);
}

.agent-list-item__content {
  flex: 1;
  min-width: 0;
}

.agent-list-item__heading {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  min-width: 0;
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
  overflow: hidden;
  color: var(--app-text-primary);
  font-size: var(--app-font-control);
  font-weight: var(--app-font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-list-item__preset {
  flex-shrink: 0;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: var(--app-font-micro);
  font-weight: var(--app-font-weight-medium);
  background: color-mix(in srgb, var(--app-hover) 70%, transparent);
  color: var(--app-text-secondary);
}

.agent-list-item__badge--disabled {
  flex-shrink: 0;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: var(--app-font-micro);
  font-weight: var(--app-font-weight-medium);
  background: color-mix(in srgb, #fa5151 16%, transparent);
  color: #fa5151;
}

.agent-list-item__desc {
  margin-top: 0.125rem;
  overflow: hidden;
  color: var(--app-text-secondary);
  font-size: var(--app-font-micro);
  text-overflow: ellipsis;
  white-space: nowrap;
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
