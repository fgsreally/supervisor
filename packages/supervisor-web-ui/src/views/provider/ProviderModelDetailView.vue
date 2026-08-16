<template>
  <div class="model-detail-view flex flex-col flex-1 min-w-0 h-full overflow-hidden">
    <header class="model-detail-header h-16 px-6 border-b flex items-center gap-3 shrink-0">
      <ProviderAvatar
        :provider-id="provider.id"
        :provider-name="provider.name"
        :icon="provider.icon"
        class="w-10 h-10"
      />
      <div class="flex-1 min-w-0">
        <h1 class="model-detail-title text-[16px] font-medium truncate">
          {{ model.name || model.modelId }}
        </h1>
        <p class="model-detail-muted text-[12px] font-mono truncate mt-0.5">
          {{ model.modelId }}
        </p>
      </div>
      <button type="button" class="model-detail-btn" @click="emit('edit')">{{ t("common.edit") }}</button>
      <button type="button" class="model-detail-btn model-detail-btn--danger" @click="remove">
        {{ t("common.delete") }}
      </button>
    </header>

    <div class="model-detail-scroll custom-scrollbar flex flex-1 justify-center overflow-y-auto">
      <div class="model-detail-content w-full max-w-5xl">
        <section class="model-detail-section">
          <h2 class="model-detail-title text-[14px] font-medium mb-5">{{ t("provider.modelConfig") }}</h2>
          <dl class="model-detail-grid">
            <div>
              <dt class="model-detail-muted">Model ID</dt>
              <dd class="model-detail-title font-mono break-all">{{ model.modelId }}</dd>
            </div>
            <div>
              <dt class="model-detail-muted">{{ t("provider.displayName") }}</dt>
              <dd class="model-detail-title">{{ model.name || model.modelId }}</dd>
            </div>
            <div>
              <dt class="model-detail-muted">{{ t("provider.contextLimit") }}</dt>
              <dd class="model-detail-title font-mono">
                {{ formatTokenCount(model.contextWindow) }}
              </dd>
            </div>
          </dl>
        </section>

        <section class="model-detail-section">
          <h2 class="model-detail-title text-[14px] font-medium mb-5">{{ t("provider.capabilities") }}</h2>
          <div class="flex items-center gap-3 text-[13px]">
            <ModelMultimodalIcon :supports-multimodal="model.supportsVision" />
            <span class="model-detail-title">
              {{ model.supportsVision ? t("provider.visionInput") : t("provider.textInputOnly") }}
            </span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ModelMultimodalIcon from "../../components/provider/ModelMultimodalIcon.vue";
import ProviderAvatar from "../../components/provider/ProviderAvatar.vue";
import type { Model, Provider } from "@/api";
import { formatTokenCount } from "@/utils/format-tokens";
import { requestUiDeleteConfirm } from "@/composables/use-ui-confirm";
import { useI18n } from "@/i18n";

const props = defineProps<{ provider: Provider; model: Model }>();
const emit = defineEmits<{ edit: []; deleted: [] }>();
const { t } = useI18n();

async function remove() {
  const confirmed = await requestUiDeleteConfirm({
    title: t("provider.deleteModel"),
    message: t("provider.deleteModelConfirm", { id: props.model.modelId }),
  });
  if (!confirmed) return;
  emit("deleted");
}
</script>

<style scoped>
.model-detail-view,
.model-detail-header {
  background: var(--app-chat-bg);
}

.model-detail-header,
.model-detail-section {
  border-color: var(--app-border);
}

.model-detail-content {
  margin-inline: auto;
  padding: 8px 24px 48px;
}

.model-detail-section {
  padding: 24px 0;
  border-bottom: 1px solid var(--app-border-subtle);
}

.model-detail-title {
  color: var(--app-text-primary);
}

.model-detail-muted {
  color: var(--app-text-secondary);
}

.model-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px 40px;
  font-size: 13px;
}

.model-detail-grid dt {
  margin-bottom: 6px;
}

.model-detail-btn {
  padding: 7px 14px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.model-detail-btn:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.model-detail-btn--danger:hover {
  color: #dc2626;
}

.model-detail-tag {
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--app-hover);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-family: monospace;
}

@media (max-width: 767px) {
  .model-detail-content {
    padding-inline: 16px;
  }

  .model-detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
