<template>
  <div class="min-w-0 flex-1">
    <div class="skill-list-name text-[13px] truncate">{{ skill.name }}</div>
    <div
      v-if="skill.layer === 'global' && skill.rootPath"
      class="skill-list-path text-[11px] font-mono truncate mt-0.5"
      :title="skill.rootPath"
    >
      {{ skill.rootPath }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UISkillItem } from "@/types/ui";

defineProps<{
  skill: UISkillItem;
}>();
</script>

<style scoped>
.skill-list-name {
  color: var(--app-text-primary);
}

.skill-list-path {
  color: var(--app-text-muted);
}
</style>
