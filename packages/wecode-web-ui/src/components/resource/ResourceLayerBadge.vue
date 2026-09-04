<template>
  <span
    v-if="layer === 'global'"
    class="resource-layer-badge inline-flex items-center px-1.5 py-0.5 rounded shrink-0"
    :title="t('resource.globalSkillSource')"
  >
    global
  </span>
  <span
    v-else-if="layer === 'project'"
    class="resource-layer-badge resource-layer-badge--project inline-flex items-center px-1.5 py-0.5 rounded shrink-0"
    :title="t('resource.projectSkillSource')"
  >
    project
  </span>
</template>

<script setup lang="ts">
import type { UIResourceLayer } from "@/types/ui";
import { useI18n } from "@/i18n";

defineProps<{
  layer: UIResourceLayer;
}>();
const { t } = useI18n();
</script>

<style scoped>
.resource-layer-badge {
  font-size: var(--app-font-micro);
  font-weight: var(--app-font-weight-medium);
  line-height: 1;
  background: color-mix(in srgb, var(--app-text-link) 14%, transparent);
  color: var(--app-text-link);
  border: 1px solid color-mix(in srgb, var(--app-text-link) 28%, transparent);
}

.resource-layer-badge--project {
  background: color-mix(in srgb, var(--app-text-secondary) 14%, transparent);
  color: var(--app-text-secondary);
  border: 1px solid color-mix(in srgb, var(--app-text-secondary) 28%, transparent);
}
</style>
