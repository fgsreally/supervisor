<template>
  <div class="inline-edit-actions">
    <button v-if="!editing" type="button" class="inline-edit-btn" @click="emit('edit')">
      {{ t("common.edit") }}
    </button>
    <template v-else>
      <button type="button" class="inline-edit-btn" @click="emit('cancel')">{{ t("common.cancel") }}</button>
      <button type="button" class="inline-edit-btn inline-edit-btn--primary" @click="emit('done')">
        {{ t("common.done") }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "@/i18n";

defineProps<{
  editing: boolean;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  edit: [];
  cancel: [];
  done: [];
}>();
</script>

<style scoped>
.inline-edit-btn {
  padding: 2px 8px;
  font-size: 12px;
  line-height: 1.4;
  border-radius: 4px;
  border: 1px solid var(--app-btn-secondary-border);
  color: var(--app-btn-secondary-text);
  background: transparent;
  transition:
    background-color 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.inline-edit-actions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.375rem;
}

.inline-edit-btn:hover {
  background: var(--app-btn-secondary-hover-bg);
  color: var(--app-text-primary);
}

.inline-edit-btn--primary {
  border-color: var(--app-accent);
  background: var(--app-accent);
  color: #ffffff;
}

.inline-edit-btn--primary:hover {
  background: var(--app-accent-hover);
  border-color: var(--app-accent-hover);
  color: #ffffff;
}
</style>
