<template>
  <div class="inline-flex items-center gap-1.5 shrink-0">
    <button
      v-if="!editing"
      type="button"
      class="inline-edit-btn"
      @click="emit('edit')"
    >
      编辑
    </button>
    <template v-else>
      <button type="button" class="inline-edit-btn" @click="emit('cancel')">
        取消
      </button>
      <button type="button" class="inline-edit-btn inline-edit-btn--primary" @click="emit('done')">
        完成
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  editing: boolean
}>()

const emit = defineEmits<{
  edit: []
  cancel: []
  done: []
}>()
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
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
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
