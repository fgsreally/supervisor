<template>
  <div class="min-w-0 flex-1">
    <div class="resource-list-item__name text-[13px] truncate">{{ name }}</div>
    <div v-if="path" class="resource-list-item__path text-[11px] font-mono truncate mt-0.5" :title="path">
      {{ path }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  name: string;
  path?: string;
}>();
</script>

<style scoped>
.resource-list-item__name {
  color: var(--app-text-primary);
}

.resource-list-item__path {
  color: var(--app-text-muted);
}
</style>
